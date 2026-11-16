// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.25;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {ICoreValueGuard} from "./interfaces/ICoreValueGuard.sol";
import {IDiamondDao} from "./interfaces/IDiamondDao.sol";
import {IDiamondDaoLowMajority} from "./interfaces/IDiamondDaoLowMajority.sol";
import {IStakingHbbft} from "./interfaces/IStakingHbbft.sol";
import {IValidatorSetHbbft} from "./interfaces/IValidatorSetHbbft.sol";
import {ValueGuards} from "diamond-contracts-core/contracts/lib/ValueGuards.sol";

import {
    DaoPhase,
    OpenProposalMajority,
    Phase,
    Proposal,
    ProposalState,
    ProposalStatistic,
    ProposalType,
    Vote,
    VoteRecord,
    VotingResult
} from "./library/DaoStructs.sol"; // prettier-ignore

import {InvalidArgument, OnlyGovernance} from "./library/Errors.sol";

import {QuorumCalculator} from "./library/QuorumCalculator.sol";

/// Diamond DAO central point of operation.
/// - Manages the DAO funds.
/// - Is able to upgrade all diamond-contracts-core contracts, including itself.
/// - Is able to vote for chain settings.
contract DiamondDao is IDiamondDao, Initializable, ReentrancyGuardUpgradeable, ValueGuards {
    using EnumerableSet for EnumerableSet.AddressSet;
    using QuorumCalculator for VotingResult;

    /// @notice To make sure we don't exceed the gas limit updating status of proposals
    uint256 public daoPhaseCount;
    uint256 public constant MAX_NEW_PROPOSALS = 1000;

    /// @dev this is the duration of each DAO phase.
    /// A full DAO cycle consists of 2 phases: Proposal and Voting,
    /// therefore the full cycle duration is double that amount.
    uint64 public constant DAO_PHASE_DURATION = 7 days;

    /// @dev gas limit for the proposal fee refund transfer to the proposer,
    /// so the proposer is not able to consume all the gas of finalization.
    uint256 public constant PROPOSAL_FEE_REFUND_GAS_LIMIT = 30_000;

    address public reinsertPot;
    uint256 public createProposalFee;

    uint256 public governancePot;

    IValidatorSetHbbft public validatorSet;
    IStakingHbbft public stakingHbbft;
    ProposalStatistic public statistic;

    DaoPhase public daoPhase;

    uint256[] public currentPhaseProposals;

    /// @dev Proposal ID to proposal data mapping
    mapping(uint256 => Proposal) public proposals;

    /// @dev contract address => is core bool
    mapping(address => bool) public isCoreContract;

    /// @dev Proposal voting results mapping
    mapping(uint256 => VotingResult) public results;

    /// @dev proposalId => (voter => vote) mapping
    mapping(uint256 => mapping(address => VoteRecord)) public votes;

    /// @dev daoEpoch => (voter => stakeSnapshot) - Voter stake amount snapshot on voting finalization
    mapping(uint256 => mapping(address => uint256)) public daoEpochStakeSnapshot;

    /// @dev daoEpoch => voters[] - specific DAO epoch voters (all proposals)
    mapping(uint256 => EnumerableSet.AddressSet) private _daoEpochVoters;

    /// @dev proposal Id => voters[] - specific proposal voters
    mapping(uint256 => EnumerableSet.AddressSet) private _proposalVoters;

    /// @dev Count of unfinalized proposals
    uint256 public unfinalizedProposals;

    /// @dev To keep track of the last DAO phase count for unfinalized proposals check
    uint256 public lastDaoPhaseCount;

    /// @dev daoEpoch => totalStakeSnapshot - Total stake amount snapshot on voting finalization
    mapping(uint256 => uint256) public daoEpochTotalStakeSnapshot;

    /// @dev daoPhaseCount => proposals[] - DAO phase proposals
    mapping(uint256 => uint256[]) public daoPhaseProposals;

    IDiamondDaoLowMajority public lowMajorityDao;

    /// @dev proposer => amount - Accepted proposals fees available to claim
    mapping(address => uint256) public proposalFeeRefunds;

    modifier exists(uint256 proposalId) {
        if (!proposalExists(proposalId)) {
            revert ProposalNotExist(proposalId);
        }
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != address(this)) {
            revert OnlyGovernance();
        }
        _;
    }

    modifier onlyPhase(Phase phase) {
        if (daoPhase.phase != phase) {
            revert UnavailableInCurrentPhase(daoPhase.phase);
        }
        _;
    }

    modifier onlyValidator() {
        if (!_isValidator(msg.sender)) {
            revert OnlyValidators(msg.sender);
        }
        _;
    }

    modifier noUnfinalizedProposals() {
        if (unfinalizedProposalsExist()) {
            revert UnfinalizedProposalsExist();
        } else if (lastDaoPhaseCount != daoPhaseCount) {
            lastDaoPhaseCount = daoPhaseCount;
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Prevents initialization of implementation contract
        _disableInitializers();
    }

    receive() external payable {
        governancePot += msg.value;
    }

    function initialize(
        address _contractOwner,
        address _validatorSet,
        address _stakingHbbft,
        address _reinsertPot,
        address _txPermission,
        address _bonusScore,
        address _lowMajorityDao,
        uint256 _createProposalFee,
        uint64 _startTimestamp
    ) external initializer {
        if (
            _contractOwner == address(0) || _validatorSet == address(0)
                || _reinsertPot == address(0) || _stakingHbbft == address(0)
                || _txPermission == address(0) || _lowMajorityDao == address(0)
                || _bonusScore == address(0) || _createProposalFee == 0
        ) {
            revert InvalidArgument();
        }

        if (_startTimestamp < block.timestamp) {
            revert InvalidStartTimestamp();
        }

        __Ownable_init(_contractOwner);
        __ReentrancyGuard_init();

        validatorSet = IValidatorSetHbbft(_validatorSet);
        stakingHbbft = IStakingHbbft(_stakingHbbft);
        lowMajorityDao = IDiamondDaoLowMajority(_lowMajorityDao);
        reinsertPot = _reinsertPot;
        createProposalFee = _createProposalFee;

        daoPhase.start = _startTimestamp;
        daoPhase.end = _startTimestamp + DAO_PHASE_DURATION;
        daoPhase.phase = Phase.Proposal;
        daoPhase.daoEpoch = 1;
        daoPhaseCount = 1;

        uint256[] memory createProposalFeeAllowedParams = new uint256[](9);
        for (uint256 i = 0; i < 9; ++i) {
            createProposalFeeAllowedParams[i] = (i + 1) * 10 ether;
        }

        __initAllowedChangeableParameter(
            this.setCreateProposalFee.selector,
            this.createProposalFee.selector,
            createProposalFeeAllowedParams
        );

        isCoreContract[address(this)] = true;
        isCoreContract[_stakingHbbft] = true;
        isCoreContract[_txPermission] = true;
        isCoreContract[_reinsertPot] = true;
        isCoreContract[_lowMajorityDao] = true;
        isCoreContract[_bonusScore] = true;
    }

    function setCreateProposalFee(uint256 _fee) external onlyGovernance withinAllowedRange(_fee) {
        createProposalFee = _fee;

        emit SetCreateProposalFee(_fee);
    }

    function setIsCoreContract(address _add, bool isCore) external onlyGovernance {
        isCoreContract[_add] = isCore;

        emit SetIsCoreContract(_add, isCore);
    }

    function switchPhase() external nonReentrant {
        uint64 currentTimestamp = uint64(block.timestamp);

        if (currentTimestamp < daoPhase.end) {
            return;
        }

        Phase newPhase = daoPhase.phase == Phase.Proposal ? Phase.Voting : Phase.Proposal;

        daoPhase.start = currentTimestamp;
        daoPhase.end = currentTimestamp + DAO_PHASE_DURATION;
        daoPhase.phase = newPhase;

        ProposalState stateToSet =
            newPhase == Phase.Voting ? ProposalState.Active : ProposalState.VotingFinished;

        bool snapshotStakes = stateToSet == ProposalState.VotingFinished;

        uint256 canceledProposals = 0;
        uint256 canceledProposalsFee = 0;

        uint256 proposalsLength = currentPhaseProposals.length;
        for (uint256 i = 0; i < proposalsLength; ++i) {
            uint256 proposalId = currentPhaseProposals[i];

            Proposal storage proposal = proposals[proposalId];

            // canceled proposal state must not be changed,
            // its fee goes to the reinsert pot on voting phase start
            if (proposal.state == ProposalState.Canceled) {
                if (newPhase == Phase.Voting) {
                    canceledProposals += 1;
                    canceledProposalsFee += proposal.proposalFee;
                }

                continue;
            }

            proposal.state = stateToSet;

            if (snapshotStakes) {
                proposal.votingDaoEpoch = daoPhase.daoEpoch;
            }
        }

        if (snapshotStakes) {
            _snapshotStakes(daoPhase.daoEpoch);

            daoPhase.daoEpoch += 1;
        }

        if (newPhase == Phase.Proposal) {
            daoPhaseProposals[daoPhaseCount] = currentPhaseProposals;
            daoPhaseCount += 1;
            delete currentPhaseProposals;
        }

        if (canceledProposals != 0) {
            unfinalizedProposals -= canceledProposals;

            // send canceled proposals fee to the reinsert pot
            _transfer(reinsertPot, canceledProposalsFee);
        }

        emit SwitchDaoPhase(daoPhase.phase, daoPhase.start, daoPhase.end);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory title,
        string memory description,
        string memory discussionUrl,
        OpenProposalMajority majority // Affects only open proposal type
    ) external payable nonReentrant onlyPhase(Phase.Proposal) noUnfinalizedProposals {
        if (
            targets.length != values.length || targets.length != calldatas.length
                || targets.length == 0
        ) {
            revert InvalidArgument();
        }

        if (msg.value != createProposalFee) {
            revert InsufficientFunds();
        }

        if (currentPhaseProposals.length >= MAX_NEW_PROPOSALS) {
            revert NewProposalsLimitExceeded();
        }

        ProposalType proposalType = _classifyProposal(targets, values, calldatas);

        // If proposal calldata decoding results to open proposal and High Majority was explicitly
        // set by the caller - treat this proposal as Open with required High Majority voting.
        if (proposalType == ProposalType.OpenLowMajority && majority == OpenProposalMajority.High) {
            proposalType = ProposalType.OpenHighMajority;
        }

        uint256 proposalId = hashProposal(targets, values, calldatas, description);

        if (proposalExists(proposalId)) {
            revert ProposalAlreadyExist(proposalId);
        }

        address proposer = msg.sender;

        Proposal storage proposal = proposals[proposalId];

        proposal.proposer = proposer;
        proposal.state = ProposalState.Created;
        proposal.targets = targets;
        proposal.values = values;
        proposal.calldatas = calldatas;
        proposal.title = title;
        proposal.description = description;
        proposal.discussionUrl = discussionUrl;
        proposal.daoPhaseCount = daoPhaseCount;
        proposal.proposalFee = createProposalFee;
        proposal.proposalType = proposalType;

        currentPhaseProposals.push(proposalId);
        statistic.total += 1;
        unfinalizedProposals += 1;

        emit ProposalCreated(
            proposer,
            proposalId,
            targets,
            values,
            calldatas,
            title,
            description,
            discussionUrl,
            createProposalFee
        );
    }

    function cancel(uint256 proposalId, string calldata reason) external exists(proposalId) {
        Proposal storage proposal = proposals[proposalId];

        if (msg.sender != proposal.proposer) {
            revert OnlyProposer();
        }

        _requireState(proposalId, ProposalState.Created);

        proposal.state = ProposalState.Canceled;
        statistic.canceled += 1;

        emit ProposalCanceled(msg.sender, proposalId, reason);
    }

    function vote(
        uint256 proposalId,
        Vote _vote
    ) external exists(proposalId) onlyPhase(Phase.Voting) onlyValidator {
        address voter = msg.sender;

        // Proposal must have Active state, checked in _submitVote
        _submitVote(voter, proposalId, _vote, "");

        emit SubmitVote(voter, proposalId, _vote);
    }

    function voteWithReason(
        uint256 proposalId,
        Vote _vote,
        string calldata reason
    ) external exists(proposalId) onlyPhase(Phase.Voting) onlyValidator {
        address voter = msg.sender;

        // Proposal must have Active state, checked in _submitVote
        _submitVote(voter, proposalId, _vote, reason);

        emit SubmitVoteWithReason(voter, proposalId, _vote, reason);
    }

    function changeVote(
        uint256 proposalId,
        Vote _vote,
        string calldata reason
    ) external exists(proposalId) onlyPhase(Phase.Voting) onlyValidator {
        if (!_proposalVoters[proposalId].contains(msg.sender)) {
            revert NoVoteFound(proposalId, msg.sender);
        }

        address voter = msg.sender;

        Proposal storage proposal = proposals[proposalId];

        if (proposal.state != ProposalState.Active) {
            revert UnexpectedProposalState(proposalId, proposal.state);
        }

        VoteRecord storage voteRecord = votes[proposalId][voter];

        if (
            voteRecord.vote == _vote
                && keccak256(bytes(voteRecord.reason)) == keccak256(bytes(reason))
        ) {
            revert SameVote(proposalId, voter, _vote);
        }

        voteRecord.vote = _vote;
        voteRecord.reason = reason;
        voteRecord.timestamp = uint64(block.timestamp);

        emit ChangeVote(voter, proposalId, _vote, reason);
    }

    function finalize(uint256 proposalId) external nonReentrant exists(proposalId) {
        _requireState(proposalId, ProposalState.VotingFinished);

        Proposal storage proposal = proposals[proposalId];
        VotingResult memory result = _countVotes(proposalId, true);

        _saveVotingResult(proposalId, result);

        bool accepted = quorumReached(proposalId, proposal.proposalType, result);

        proposal.state = accepted ? ProposalState.Accepted : ProposalState.Declined;

        if (accepted) {
            statistic.accepted += 1;

            // return fee back to the proposer, if transfer fails
            // it can be claimed later by the proposer only
            if (!_tryTransfer(proposal.proposer, proposal.proposalFee)) {
                proposalFeeRefunds[proposal.proposer] += proposal.proposalFee;

                emit ProposalFeeRefundFailed(proposal.proposer, proposalId, proposal.proposalFee);
            }
        } else {
            statistic.declined += 1;

            // send fee to the reinsert pot
            _transfer(reinsertPot, proposal.proposalFee);
        }

        unfinalizedProposals -= 1;

        emit VotingFinalized(msg.sender, proposalId, accepted);
    }

    function execute(uint256 proposalId) external nonReentrant exists(proposalId) {
        _requireState(proposalId, ProposalState.Accepted);
        _requireIsExecutable(proposalId);

        Proposal storage proposal = proposals[proposalId];

        proposal.state = ProposalState.Executed;

        if (proposal.proposalType == ProposalType.OpenLowMajority) {
            lowMajorityDao.execute(
                proposalId, proposal.targets, proposal.values, proposal.calldatas
            );
        } else {
            _executeOperations(proposal.targets, proposal.values, proposal.calldatas);
        }

        emit ProposalExecuted(msg.sender, proposalId);
    }

    function claimProposalFee() external nonReentrant {
        address proposer = msg.sender;
        uint256 amount = proposalFeeRefunds[proposer];

        if (amount == 0) {
            revert NothingToClaim();
        }

        proposalFeeRefunds[proposer] = 0;

        _transfer(proposer, amount);

        emit ProposalFeeClaimed(proposer, amount);
    }

    function getCurrentPhaseProposals() external view returns (uint256[] memory) {
        return currentPhaseProposals;
    }

    function getProposalVotersCount(uint256 proposalId) external view returns (uint256) {
        return _proposalVoters[proposalId].length();
    }

    function getProposalVoters(uint256 proposalId) public view returns (address[] memory) {
        return _proposalVoters[proposalId].values();
    }

    function proposalExists(uint256 proposalId) public view returns (bool) {
        return proposals[proposalId].proposer != address(0);
    }

    function getProposal(uint256 proposalId) public view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function countVotes(uint256 proposalId)
        external
        view
        exists(proposalId)
        returns (VotingResult memory)
    {
        ProposalState state = proposals[proposalId].state;

        if (
            state == ProposalState.Accepted || state == ProposalState.Declined
                || state == ProposalState.Executed
        ) {
            return results[proposalId];
        } else if (state == ProposalState.VotingFinished) {
            return _countVotes(proposalId, true);
        } else if (state == ProposalState.Active) {
            return _countVotes(proposalId, false);
        }
        {
            revert UnexpectedProposalState(proposalId, state);
        }
    }

    function _countVotes(
        uint256 proposalId,
        bool useSnapshot
    ) private view returns (VotingResult memory) {
        uint64 daoEpoch = proposals[proposalId].votingDaoEpoch;

        VotingResult memory result;

        address[] memory voters = getProposalVoters(proposalId);

        for (uint256 i = 0; i < voters.length; ++i) {
            address voter = voters[i];

            uint256 stakeAmount = 0;

            if (useSnapshot) {
                stakeAmount = daoEpochStakeSnapshot[daoEpoch][voter];
            } else {
                stakeAmount = stakingHbbft.stakeAmountTotal(voter);
            }

            Vote _vote = votes[proposalId][voter].vote;

            if (_vote == Vote.Yes) {
                result.countYes += 1;
                result.stakeYes += stakeAmount;
            } else if (_vote == Vote.No) {
                result.countNo += 1;
                result.stakeNo += stakeAmount;
            }
        }

        return result;
    }

    /// @dev Checks if the quorum has been reached for a given proposal type and voting result.
    /// @param _type The type of the proposal.
    /// @param result The voting result containing the counts of "yes" and "no" votes.
    /// @return A boolean indicating whether the quorum has been reached.
    function quorumReached(
        uint256 proposalId,
        ProposalType _type,
        VotingResult memory result
    ) public view returns (bool) {
        uint256 totalVotes = _proposalVoters[proposalId].length();

        uint256 daoEpoch = proposals[proposalId].votingDaoEpoch;
        uint256 totalStakedAmount = daoEpochTotalStakeSnapshot[daoEpoch];
        bool isQuorumReached;

        if (_type == ProposalType.ContractUpgrade || _type == ProposalType.OpenHighMajority) {
            isQuorumReached = result.highMajorityQuorum(totalStakedAmount);
        } else if (_type == ProposalType.OpenLowMajority) {
            isQuorumReached = lowMajorityDao.quorumReached(result, totalStakedAmount);
        } else {
            isQuorumReached = result.lowMajorityQuorum(totalStakedAmount);
        }

        return totalVotes > 0 && isQuorumReached;
    }

    function hashProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public pure virtual returns (uint256) {
        bytes32 descriptionHash = keccak256(bytes(description));

        return uint256(keccak256(abi.encode(targets, values, calldatas, descriptionHash)));
    }

    function unfinalizedProposalsExist() public view returns (bool) {
        if (lastDaoPhaseCount != daoPhaseCount && unfinalizedProposals > 0) {
            return true;
        }
        return false;
    }

    function _snapshotStakes(uint64 daoEpoch) private {
        address[] memory daoEpochVoters = _daoEpochVoters[daoEpoch].values();

        for (uint256 i = 0; i < daoEpochVoters.length; ++i) {
            address voter = daoEpochVoters[i];
            uint256 stakeAmount = stakingHbbft.stakeAmountTotal(voter);
            daoEpochStakeSnapshot[daoEpoch][voter] = stakeAmount;
        }

        daoEpochTotalStakeSnapshot[daoEpoch] = stakingHbbft.totalStakedAmount();
    }

    function _submitVote(
        address voter,
        uint256 proposalId,
        Vote _vote,
        string memory reason
    ) private {
        _requireState(proposalId, ProposalState.Active);

        if (_proposalVoters[proposalId].contains(voter)) {
            revert AlreadyVoted(proposalId, voter);
        }

        _daoEpochVoters[daoPhase.daoEpoch].add(voter);
        _proposalVoters[proposalId].add(voter);

        votes[proposalId][voter] =
            VoteRecord({timestamp: uint64(block.timestamp), vote: _vote, reason: reason});
    }

    function _saveVotingResult(uint256 proposalId, VotingResult memory res) private {
        VotingResult storage result = results[proposalId];

        result.countNo = res.countNo;
        result.countYes = res.countYes;
        result.stakeNo = res.stakeNo;
        result.stakeYes = res.stakeYes;
    }

    function _executeOperations(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas
    ) private {
        for (uint256 i = 0; i < targets.length; ++i) {
            uint256 execValue = calldatas[i].length == 0 ? values[i] : 0;
            (bool success, bytes memory returndata) =
                targets[i].call{value: execValue}(calldatas[i]);

            Address.verifyCallResult(success, returndata);

            if (execValue != 0) {
                governancePot -= execValue;
            }
        }
    }

    function _transfer(address recipient, uint256 amount) private {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success,) = recipient.call{value: amount}("");
        if (!success) {
            revert TransferFailed(address(this), recipient, amount);
        }
    }

    function _tryTransfer(address recipient, uint256 amount) private returns (bool success) {
        // limited gas and no return data copy
        assembly {
            success := call(PROPOSAL_FEE_REFUND_GAS_LIMIT, recipient, amount, 0, 0, 0, 0)
        }
    }

    function _requireState(uint256 _proposalId, ProposalState _state) private view {
        ProposalState state = getProposal(_proposalId).state;

        if (state != _state) {
            revert UnexpectedProposalState(_proposalId, state);
        }
    }

    function _requireIsExecutable(uint256 _proposalId) private view {
        Proposal memory proposal = getProposal(_proposalId);

        if (proposal.daoPhaseCount + 1 != daoPhaseCount) {
            revert OutsideExecutionWindow(_proposalId);
        }

        if (
            proposal.proposalType == ProposalType.ContractUpgrade && proposal.proposer != msg.sender
        ) {
            revert NotProposer(_proposalId, msg.sender);
        }
    }

    function _isValidator(address stakingAddress) private view returns (bool) {
        return stakingHbbft.isPoolValid(stakingAddress);
    }

    /// @dev Extracts the function selector and value from the given call data.
    /// @param _data The call data to extract from.
    /// @return funcSelector The function selector extracted from the call data.
    /// @return value The value extracted from the call data (assuming it's uint256).
    function _extractCallData(bytes memory _data)
        private
        pure
        returns (bytes4 funcSelector, uint256 value)
    {
        // Extract function selector
        assembly {
            funcSelector := mload(add(_data, 0x20))
        }

        // Extract value from parameter (assuming it's uint256)
        assembly {
            value := mload(add(_data, 0x24))
        }
    }

    /// @dev Returns the type of proposal based on its operations.
    /// @param targets The array of target addresses.
    /// @param values The array of values to be sent.
    /// @param calldatas The array of calldata bytes.
    /// @return The type of proposal (Open, EcosystemParameterChange, or ContractUpgrade).
    function _classifyProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas
    ) private view returns (ProposalType) {
        bool hasFundsTransfer = false;
        bool hasParameterChange = false;

        for (uint256 i = 0; i < targets.length; ++i) {
            ProposalType operationType = _classifyOperation(targets[i], values[i], calldatas[i]);

            if (operationType == ProposalType.ContractUpgrade) {
                return ProposalType.ContractUpgrade;
            }

            if (operationType == ProposalType.EcosystemParameterChange) {
                hasParameterChange = true;
            } else {
                hasFundsTransfer = true;
            }
        }

        if (hasParameterChange && hasFundsTransfer) {
            return ProposalType.OpenHighMajority;
        }

        if (hasParameterChange) {
            return ProposalType.EcosystemParameterChange;
        }

        return ProposalType.OpenLowMajority;
    }

    /// @dev Returns the type of a single proposal operation.
    /// @param target The operation target address.
    /// @param value The operation value.
    /// @param data The operation calldata.
    /// @return The type of operation, value from ProposalType enum.
    function _classifyOperation(
        address target,
        uint256 value,
        bytes memory data
    ) private view returns (ProposalType) {
        if (target == address(0)) {
            revert InvalidArgument();
        }

        // Both ContractUpgrade and EcosystemParameterChange require a calldata.
        if (data.length == 0) {
            return ProposalType.OpenLowMajority;
        }

        // 4-byte selector + uint256 argument
        if (!isCoreContract[target] || value != 0 || data.length != 36) {
            return ProposalType.ContractUpgrade;
        }

        (bytes4 setterSelector, uint256 newVal) = _extractCallData(data);

        // Perform the low-level call to check if the allowed ranges are defined on the target contract's method.
        // This is done to avoid calling isWithinAllowedRange, which will revert if ranges are not defined.
        (bool success, bytes memory result) = target.staticcall(
            abi.encodeCall(ICoreValueGuard.getAllowedParamsRangeWithSelector, (setterSelector))
        );

        if (!success || result.length == 0) {
            return ProposalType.ContractUpgrade;
        }

        ICoreValueGuard.ParameterRange memory rangeData =
            abi.decode(result, (ICoreValueGuard.ParameterRange));

        if (rangeData.range.length == 0) {
            return ProposalType.ContractUpgrade;
        }

        if (!ICoreValueGuard(target).isWithinAllowedRange(setterSelector, newVal)) {
            revert NewValueOutOfRange(newVal);
        }

        return ProposalType.EcosystemParameterChange;
    }
}
