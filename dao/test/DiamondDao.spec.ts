import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import hre from "hardhat";

import { type Address, getAddress, Hex, parseEther, parseEventLogs, parseUnits, zeroAddress } from "viem";

import { deployProxy } from "./fixtures/proxy.js";
import { createRandomWallet } from "./fixtures/wallet.js";

import {
  createProposal,
  CreateProposalFee,
  OpenProposalMajority,
  ProposalState,
  Vote
} from "./fixtures/proposal.js";

import { DiamondDao, MockValidatorSetHbbft, MockStakingHbbft, DaoPhase } from "./fixtures/types.js";
import { EmptyBytes, getRandomBigInt } from "./fixtures/utils.js";

const connection = await hre.network.getOrCreate();
const { viem: hhViem, networkHelpers: helpers } = connection;

const publicClient = await hhViem.getPublicClient();
type TestWalletClient = Awaited<ReturnType<typeof hhViem.getWalletClients>>[number];

describe("DiamondDao contract", function () {
  let owner: TestWalletClient;
  let users: TestWalletClient[];
  let reinsertPot: TestWalletClient;

  let randomWallet = () => createRandomWallet().address;

  before(async function () {
    [owner, reinsertPot, ...users] = await hhViem.getWalletClients();
  });

  async function deployFixture() {
    const mockValidatorSet = await hhViem.deployContract("MockValidatorSetHbbft");
    const mockStaking = await hhViem.deployContract("MockStakingHbbft", [mockValidatorSet.address]);

    const mockTxPermission = randomWallet();
    const mockBonusScore = randomWallet();

    const daoLowMajority = await deployProxy(hhViem, "MockDiamondDaoLowMajority", {
      initArgs: [owner.account.address],
      initializer: "initialize",
    });

    const startTime = await helpers.time.latest() + 100;

    const dao = await deployProxy(hhViem, "DiamondDao", {
      initArgs: [
        owner.account.address,
        mockValidatorSet.address,
        mockStaking.address,
        reinsertPot.account.address,
        mockTxPermission,
        mockBonusScore,
        daoLowMajority.address,
        CreateProposalFee,
        startTime,
      ],
      initializer: "initialize",
    });

    await daoLowMajority.write.setMainDaoAddress([dao.address]);

    return { dao, daoLowMajority, mockValidatorSet, mockStaking };
  }

  async function swithPhase(dao: DiamondDao) {
    const [, end, ,] = await dao.read.daoPhase();
    await helpers.time.increaseTo(end + 1n);

    await dao.write.switchPhase();
  }

  async function addValidatorsStake(
    validatorSet: MockValidatorSetHbbft,
    staking: MockStakingHbbft,
    validators: TestWalletClient[],
    stakeAmount?: bigint
  ) {
    const stake = stakeAmount ? stakeAmount : parseEther('10');

    for (const validator of validators) {
      await validatorSet.write.add([validator.account.address, validator.account.address, true]);
      await staking.write.setStake([validator.account.address, stake]);
    }
  }

  async function vote(
    dao: DiamondDao,
    proposalId: bigint,
    voters: TestWalletClient[],
    vote: Vote
  ) {
    for (const voter of voters) {
      await dao.write.vote([proposalId, vote], { account: voter.account });
    }
  }

  async function changeVote(
    dao: DiamondDao,
    proposalId: bigint,
    voters: TestWalletClient[],
    vote: Vote
  ) {
    for (const voter of voters) {
      await dao.write.changeVote([proposalId, vote, ""], { account: voter.account });
    }
  }

  describe("initializer", async function () {
    let InitializeCases = [
      {
        name: "contract owner address",
        contractOwner: zeroAddress,
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "ValidatorSet contract address",
        contractOwner: randomWallet(),
        validatorSet: zeroAddress,
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "StakingHbbft contract address",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: zeroAddress,
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "reinsert pot address",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: zeroAddress,
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "TxPermission contract address",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: zeroAddress,
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "bonusScore contract address",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: zeroAddress,
        lowMajorityDao: randomWallet(),
        proposalFee: CreateProposalFee,
      },
      {
        name: "DiamondDaoLowMajority contract address",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: zeroAddress,
        proposalFee: CreateProposalFee,
      },
      {
        name: "create proposal fee",
        contractOwner: randomWallet(),
        validatorSet: randomWallet(),
        stakingHbbft: randomWallet(),
        reinsertPot: randomWallet(),
        txPermission: randomWallet(),
        bonusScore: randomWallet(),
        lowMajorityDao: randomWallet(),
        proposalFee: 0n,
      },
    ];

    InitializeCases.forEach((args) => {
      it(`should revert deployment with zero ${args.name}`, async function () {
        const implementation = await hhViem.deployContract("DiamondDao");
        const startTime = await helpers.time.latest() + 1;

        await hhViem.assertions.revertWithCustomError(
          deployProxy(hhViem, "DiamondDao", {
            initArgs: [
              args.contractOwner,
              args.validatorSet,
              args.stakingHbbft,
              args.reinsertPot,
              args.txPermission,
              args.bonusScore,
              args.lowMajorityDao,
              args.proposalFee,
              startTime + 1,
            ],
            initializer: "initialize",
          }),
          implementation,
          "InvalidArgument",
        );
      });
    });

    it("should revert deployment with invalid start timestamp", async function () {
      const implementation = await hhViem.deployContract("DiamondDao");
      const startTime = await helpers.time.latest();

      await hhViem.assertions.revertWithCustomError(
        deployProxy(hhViem, "DiamondDao", {
          initArgs: [
            randomWallet(),
            randomWallet(),
            randomWallet(),
            randomWallet(),
            randomWallet(),
            randomWallet(),
            randomWallet(),
            CreateProposalFee,
            startTime - 10
          ],
          initializer: "initialize",
        }),
        implementation,
        "InvalidStartTimestamp",
      );
    });

    it("should not allow reinitialization", async function () {
      const implementation = await hhViem.deployContract("DiamondDao");
      let startTime = await helpers.time.latest() + 10;

      const dao = await deployProxy(hhViem, "DiamondDao", {
        initArgs: [
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          CreateProposalFee,
          startTime
        ],
        initializer: "initialize",
      });

      startTime = await helpers.time.latest() + 100;

      await hhViem.assertions.revertWithCustomError(
        dao.write.initialize([
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          randomWallet(),
          CreateProposalFee,
          BigInt(startTime)
        ]),
        implementation,
        "InvalidInitialization",
      );
    });
  });

  describe("switchPhase", async function () {
    it("should not switch DAO phase before its end", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const daoPhaseBefore = await dao.read.daoPhase();

      const hash = await dao.write.switchPhase();
      const receipt = await publicClient.getTransactionReceipt({ hash });

      const logs = await publicClient.getContractEvents({
        address: dao.address,
        abi: dao.abi,
        eventName: 'SwitchDaoPhase',
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber
      });

      assert.strictEqual(logs.length, 0, "should not emit event");

      const daoPhaseAfter = await dao.read.daoPhase();

      assert.deepEqual(Object.values(daoPhaseBefore), Object.values(daoPhaseAfter));
    });

    it("should switch DAO phase and emit event", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const [, end, ,] = await dao.read.daoPhase();

      await helpers.time.increaseTo(end);

      const timestamp = await helpers.time.latest();
      const daoPhaseDuration = await dao.read.DAO_PHASE_DURATION();

      const expectedStartTimestamp = BigInt(timestamp + 1);
      const expectedEndTimestamp = BigInt(expectedStartTimestamp) + daoPhaseDuration;

      await hhViem.assertions.emitWithArgs(
        dao.write.switchPhase(),
        dao,
        "SwitchDaoPhase",
        [DaoPhase.Voting, expectedStartTimestamp, expectedEndTimestamp],
      );

      const [phaseStart, phaseEnd, , phase] = await dao.read.daoPhase();

      assert.equal(phase, DaoPhase.Voting);
      assert.equal(phaseStart, expectedStartTimestamp);
      assert.equal(phaseEnd, expectedEndTimestamp);
    });

    it("should switch DAO phase from Proposal to Voting", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      await swithPhase(dao);
      const [, , , phase] = await dao.read.daoPhase();

      assert.equal(phase, DaoPhase.Voting);
    });

    it("should switch DAO phase to Voting and set Active proposal state", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposals = [];

      proposals.push(await createProposal(dao, users[2].account, { description: users[2].account.address }));
      proposals.push(await createProposal(dao, users[3].account, { description: users[3].account.address }));
      proposals.push(await createProposal(dao, users[4].account, { description: users[4].account.address }));

      const currentProposals = await dao.read.getCurrentPhaseProposals();

      assert.equal(currentProposals.length, proposals.length);
      for (const proposal of proposals) {
        assert.equal((await dao.read.getProposal([proposal.proposalId])).state, ProposalState.Created);
        assert.ok(currentProposals.includes(proposal.proposalId));
      }

      await swithPhase(dao);

      for (const proposal of proposals) {
        assert.equal((await dao.read.getProposal([proposal.proposalId])).state, ProposalState.Active);
      }
    });

    it("should switch DAO phase from Voting to Proposal and clear current phase proposals", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposals = [];

      proposals.push(await createProposal(dao, users[2].account, { description: users[2].account.address }));
      proposals.push(await createProposal(dao, users[3].account, { description: users[3].account.address }));
      proposals.push(await createProposal(dao, users[4].account, { description: users[4].account.address }));

      for (const proposal of proposals) {
        assert.equal((await dao.read.getProposal([proposal.proposalId])).state, ProposalState.Created);
      }

      await swithPhase(dao);
      await swithPhase(dao);

      const [, , , daoPhase] = await dao.read.daoPhase();

      assert.equal(daoPhase, DaoPhase.Proposal);

      for (const proposal of proposals) {
        assert.equal((await dao.read.getProposal([proposal.proposalId])).state, ProposalState.VotingFinished);
      }

      assert.equal((await dao.read.getCurrentPhaseProposals()).length, 0);
    });
  });

  describe("propose", async function () {
    it("should revert propose with empty targets array", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets: Address[] = [];
      const values: bigint[] = [];
      const calldatas: Hex[] = [];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ],
          { value: CreateProposalFee },
        ),
        dao,
        "InvalidArgument",
      );
    });

    it("should revert propose with targets.length != values.length", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets = [users[1].account.address, users[2].account.address];
      const values = [1n];
      const calldatas = [EmptyBytes, EmptyBytes];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ],
          { value: CreateProposalFee },
        ),
        dao,
        "InvalidArgument"
      );
    });

    it("should revert propose with targets.length != calldatas.length", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets = [users[1].account.address];
      const values = [1n, 1n];
      const calldatas = [EmptyBytes, EmptyBytes];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ], { value: CreateProposalFee }
        ),
        dao,
        "InvalidArgument",
      );
    });

    it("should revert propose with zero address target", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets = [zeroAddress];
      const values = [1n];
      const calldatas = [EmptyBytes];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ],
          { value: CreateProposalFee },
        ),
        dao,
        "InvalidArgument",
      );
    });

    it("should revert propose without proposal fee payment", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets = [users[3].account.address];
      const values = [1n];
      const calldatas = [EmptyBytes];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ],
          { value: 0n },
        ),
        dao,
        "InsufficientFunds",
      );
    });

    it("should revert propose if same proposal already exists", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const targets = [users[3].account.address];
      const values = [parseEther("1")];
      const calldatas = [EmptyBytes];
      const description = "test";
      const majority = OpenProposalMajority.Low;

      const proposalId = await dao.read.hashProposal([
        targets,
        values,
        calldatas,
        description,
      ]);

      assert.ok(await dao.write.propose(
        [
          targets,
          values,
          calldatas,
          "title",
          description,
          "url",
          majority,
        ],
        { value: CreateProposalFee })
      );

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            description,
            "url",
            majority,
          ],
          { value: CreateProposalFee },
        ),
        dao,
        "ProposalAlreadyExist",
        [proposalId],
      );
    });

    it("should revert propose on Voting phase", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      await swithPhase(dao);

      const targets = [users[3].account.address];
      const values = [1n];
      const calldatas = [EmptyBytes];
      const majority = OpenProposalMajority.Low;

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            "test",
            "url",
            majority,
          ],
          { value: CreateProposalFee },
        ),
        dao,
        "UnavailableInCurrentPhase",
        [DaoPhase.Voting],
      );
    });

    it("should revert propose if limit was reached", async function () {
      const proposer = users[2];
      const { dao } = await helpers.loadFixture(deployFixture);

      const usersSubset = users.slice(10, 20);
      const majority = OpenProposalMajority.Low;

      for (let i = 0; i < 100; ++i) {
        for (const user of usersSubset) {
          assert.ok(await createProposal(dao, user.account, { description: `proposal ${i} ${user.account.address}` }));
        }
      }

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            [users[3].account.address],
            [parseEther('10')],
            [EmptyBytes],
            "title",
            "should fail",
            "url",
            majority,
          ],
          {
            value: CreateProposalFee,
            account: proposer.account
          }
        ),
        dao,
        "NewProposalsLimitExceeded",
      );
    });

    it("should revert propose if there are unfinalized proposals in previous phases", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];

      const targets = [users[3].account.address];
      const values = [parseEther("1")];
      const calldatas = [EmptyBytes];
      const description = "test";
      const majority = OpenProposalMajority.Low;

      await createProposal(dao, proposer.account);

      await swithPhase(dao);
      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomError(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            description,
            "url",
            majority,
          ],
          { value: CreateProposalFee, account: proposer.account }
        ),
        dao,
        "UnfinalizedProposalsExist",
      );
    });

    it("should create proposal and emit event", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];

      const targets = [getAddress(users[3].account.address)];
      const values = [parseEther("1")];
      const calldatas = [EmptyBytes];
      const description = "test";
      const majority = OpenProposalMajority.Low;

      const proposalId = await dao.read.hashProposal([
        targets,
        values,
        calldatas,
        description
      ]);

      await hhViem.assertions.emitWithArgs(
        dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            description,
            "url",
            majority,
          ],
          { value: CreateProposalFee, account: proposer.account },
        ),
        dao,
        "ProposalCreated",
        [
          getAddress(proposer.account.address),
          proposalId,
          targets,
          values,
          calldatas,
          "title",
          description,
          "url",
          CreateProposalFee
        ]
      );
    });

    it("should create proposal and save data", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];

      const targets = [getAddress(users[3].account.address)];
      const values = [parseEther("1")];
      const calldatas = [EmptyBytes];
      const description = "test";
      const majority = OpenProposalMajority.Low;

      const proposalId = await dao.read.hashProposal([
        targets,
        values,
        calldatas,
        description
      ]);

      assert.ok(
        await dao.write.propose(
          [
            targets,
            values,
            calldatas,
            "title",
            description,
            "url",
            majority,
          ],
          { value: CreateProposalFee, account: proposer.account }
        ),
      );

      assert.ok(await dao.read.proposalExists([proposalId]));

      const savedData = await dao.read.getProposal([proposalId]);

      assert.deepEqual(
        Object.values(savedData),
        [
          getAddress(proposer.account.address),
          0n,
          ProposalState.Created,
          targets,
          values,
          calldatas,
          "title",
          description,
          "url",
          1n, // first phase
          CreateProposalFee,
          0 // open proposal
        ],
      );
    });

    it("should create proposal and update statistical data", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const [totalBefore,] = await dao.read.statistic();

      const proposer = users[1];
      await createProposal(dao, proposer.account);

      const [totalAfter,] = await dao.read.statistic();
      assert.equal(totalAfter, totalBefore + 1n);
    });
  });

  describe("cancel", async function () {
    it("should revert cancel for non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const nonExistingProposalId = getRandomBigInt();

      hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.cancel([nonExistingProposalId, "test"]),
        dao,
        "ProposalNotExist",
        [nonExistingProposalId]
      );
    });

    it("should revert cancel not by proposal creator", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const caller = users[3];

      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomError(
        dao.write.cancel([proposalId, "test"], { account: caller.account }),
        dao,
        "OnlyProposer",
      );
    });

    it("should revert cancel of active proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.cancel([proposalId, "reason"], { account: proposer.account }),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Active],
      );
    });

    it("should cancel proposal and emit event", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const reason = "proposal-cancel-reason";

      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.emitWithArgs(
        dao.write.cancel([proposalId, reason], { account: proposer.account }),
        dao,
        "ProposalCanceled",
        [getAddress(proposer.account.address), proposalId, reason],
      );
    });

    it("should cancel proposal and change its status to canceled", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const { proposalId } = await createProposal(dao, proposer.account);

      let proposalData = await dao.read.getProposal([proposalId]);
      assert.equal(proposalData.state, ProposalState.Created);

      assert.ok(await dao.write.cancel([proposalId, "reason"], { account: proposer.account }));

      proposalData = await dao.read.getProposal([proposalId]);
      assert.equal(proposalData.state, ProposalState.Canceled);
    });

    it("should cancel proposal and update statistics", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const { proposalId } = await createProposal(dao, proposer.account);

      const [, , , canceledBefore] = await dao.read.statistic();

      assert.ok(await dao.write.cancel([proposalId, "reason"], { account: proposer.account }));

      const [, , , canceledAfter] = await dao.read.statistic();
      assert.equal(canceledAfter, canceledBefore + 1n);
    });
  });

  describe("vote", async function () {
    it("should revert vote for non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposalId = getRandomBigInt();

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.vote([proposalId, Vote.Yes]),
        dao,
        "ProposalNotExist",
        [proposalId]
      );
    });

    it("should revert vote on wrong phase", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const proposer = users[10];

      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.vote([proposalId, Vote.Yes]),
        dao,
        "UnavailableInCurrentPhase",
        [DaoPhase.Proposal],
      );
    });

    it("should revert vote not by validator", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.vote([proposalId, Vote.Yes], { account: voter.account }),
        dao,
        "OnlyValidators",
        [getAddress(voter.account.address)],
      );
    });

    it("should revert vote by inactive validator", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.vote([proposalId, Vote.Yes], { account: voter.account }),
        dao,
        "OnlyValidators",
        [getAddress(voter.account.address)],
      );
    });

    it("should submit vote by validator and emit event", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];
      const vote = Vote.Yes;

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await hhViem.assertions.emitWithArgs(
        dao.write.vote([proposalId, vote], { account: voter.account }),
        dao,
        "SubmitVote",
        [getAddress(voter.account.address), proposalId, vote],
      );
    });

    it("should submit vote and add voter to set", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voters = users.slice(5, 10);

      const vote = Vote.Yes;

      const { proposalId } = await createProposal(dao, proposer.account);
      await swithPhase(dao);

      for (const voter of voters) {
        await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
        assert.ok(await dao.write.vote([proposalId, vote], { account: voter.account }));
      }

      const votersAddressList = voters.map(x => getAddress(x.account.address));

      const savidVotersCount = await dao.read.getProposalVotersCount([proposalId]);
      const savedVotersList = await dao.read.getProposalVoters([proposalId]);

      assert.equal(savidVotersCount, BigInt(savedVotersList.length));
      assert.equal(savidVotersCount, BigInt(votersAddressList.length));

      assert.deepEqual(savedVotersList, votersAddressList);
    });

    it("should submit vote and save its data", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];

      const voter = users[11];
      const vote = Vote.Yes;

      const { proposalId } = await createProposal(dao, proposer.account);
      await swithPhase(dao);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      assert.ok(await dao.write.vote([proposalId, vote], { account: voter.account }));

      const voteTimestamp = await helpers.time.latest();
      const savedVoteData = await dao.read.votes([proposalId, voter.account.address]);

      assert.deepEqual(Object.values(savedVoteData), [BigInt(voteTimestamp), vote, ""]);
    });
  });

  describe("voteWithReason", async function () {
    it("should revert vote with reason for non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposalId = getRandomBigInt();

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.voteWithReason([proposalId, Vote.Yes, "reason"]),
        dao,
        "ProposalNotExist",
        [proposalId],
      );
    });

    it("should revert vote with reason on wrong phase", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const proposer = users[10];

      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.voteWithReason([proposalId, Vote.Yes, "reason"]),
        dao,
        "UnavailableInCurrentPhase",
        [DaoPhase.Proposal],
      );
    });

    it("should revert vote with reason not by validator", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.voteWithReason([proposalId, Vote.Yes, "reason"], { account: voter.account }),
        dao,
        "OnlyValidators",
        [voter.account.address],
      );
    });

    it("should submot vote with reason by validator and emit event", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];
      const vote = Vote.Yes;
      const reason = "vote reason"

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await hhViem.assertions.emitWithArgs(
        dao.write.voteWithReason([proposalId, vote, reason], { account: voter.account }),
        dao,
        "SubmitVoteWithReason",
        [voter.account.address, proposalId, vote, reason],
      );
    });

    it("should submit vote with reason and add voter to set", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];

      const voters = users.slice(5, 10);
      const vote = Vote.Yes;

      const { proposalId } = await createProposal(dao, proposer.account);
      await swithPhase(dao);

      for (const voter of voters) {
        await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
        assert.ok(await dao.write.voteWithReason([proposalId, vote, "reason"], { account: voter.account }));
      }

      const votersAddressList = voters.map(x => getAddress(x.account.address));

      const savidVotersCount = await dao.read.getProposalVotersCount([proposalId]);
      const savedVotersList = await dao.read.getProposalVoters([proposalId]);

      assert.equal(savidVotersCount, BigInt(savedVotersList.length));
      assert.equal(savidVotersCount, BigInt(votersAddressList.length));

      assert.deepEqual(savedVotersList, votersAddressList);
    });

    it("should submit vote with reason and save its data", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];

      const voter = users[11];
      const vote = Vote.Yes;
      const reason = "vote reason"

      const { proposalId } = await createProposal(dao, proposer.account);
      await swithPhase(dao);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      assert.ok(await dao.write.voteWithReason([proposalId, vote, reason], { account: voter.account }));

      const voteTimestamp = await helpers.time.latest();
      const savedVoteData = await dao.read.votes([proposalId, voter.account.address]);

      assert.deepEqual(Object.values(savedVoteData), [BigInt(voteTimestamp), vote, reason]);
    });
  });

  describe("changeVote", async function () {
    it("should revert in case of double voting", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const voter = users[2];

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await dao.write.vote([proposalId, Vote.Yes], { account: voter.account });

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.vote([proposalId, Vote.No], { account: voter.account }),
        dao,
        "AlreadyVoted",
        [proposalId, voter.account.address]
      );
    });

    it("should revert change vote if voter has not voted yet", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const voter = users[2];

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.changeVote([proposalId, Vote.Yes, "reason"], { account: voter.account }),
        dao,
        "NoVoteFound",
        [proposalId, voter.account.address],
      );
    });

    it("should revert if same vote is submitted", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await dao.write.voteWithReason([proposalId, Vote.Yes, "reason"], { account: voter.account });

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.changeVote([proposalId, Vote.Yes, "reason"], { account: voter.account }),
        dao,
        "SameVote",
        [proposalId, voter.account.address, Vote.Yes]
      );
    });

    it("should allow user to change vote", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await dao.write.vote([proposalId, Vote.Yes], { account: voter.account });
      assert.ok(await dao.write.changeVote([proposalId, Vote.No, "reason"], { account: voter.account }));
    });

    it("should allow user to change vote reason", async function () {
      const { dao, mockValidatorSet } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const voter = users[9];

      const { proposalId } = await createProposal(dao, proposer.account);

      await mockValidatorSet.write.add([voter.account.address, voter.account.address, true]);
      await swithPhase(dao);

      await dao.write.voteWithReason([proposalId, Vote.Yes, "reason"], { account: voter.account });
      assert.ok(await dao.write.changeVote([proposalId, Vote.No, "new reason"], { account: voter.account }));
    });
  });

  describe("countVotes", async function () {
    it("should revert count votes for non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposalId = getRandomBigInt();

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.read.countVotes([proposalId]),
        dao,
        "ProposalNotExist",
        [proposalId],
      );
    });

    it("should revert count votes for proposal with state = Created", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const proposer = users[10];

      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.read.countVotes([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Created],
      );
    });

    it("should revert count votes for proposal with state = Canceled", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[10];
      const { proposalId } = await createProposal(dao, proposer.account);

      assert.ok(await dao.write.cancel([proposalId, "test"], { account: proposer.account }));

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.read.countVotes([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Canceled],
      );
    });

    it("should use current stake amounts for active proposal", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[4];
      const voters = users.slice(5, 15);
      const stakeAmount = parseEther('15');

      await addValidatorsStake(mockValidatorSet, mockStaking, voters, stakeAmount);

      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.Yes);

      assert.deepEqual(
        Object.values(await dao.read.countVotes([proposalId])),
        [
          BigInt(voters.length),
          0n,
          stakeAmount * BigInt(voters.length),
          0n
        ],
      );

      await changeVote(dao, proposalId, voters, Vote.No);

      assert.deepEqual(
        Object.values(await dao.read.countVotes([proposalId])),
        [
          0n,
          BigInt(voters.length),
          0n,
          stakeAmount * BigInt(voters.length),
        ],
      );
    });

    it("should use stake amounts snapshot after voting finish", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[4];
      const votersYes = users.slice(5, 15);
      const votersNo = users.slice(15, 10);
      const stakeAmount = parseEther('10');

      await addValidatorsStake(
        mockValidatorSet,
        mockStaking,
        [...votersYes, ...votersNo],
        stakeAmount
      );

      const { proposalId } = await createProposal(dao, proposer.account);

      await swithPhase(dao);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);
      await swithPhase(dao);

      const expectedVotesCount = [
        BigInt(votersYes.length),
        BigInt(votersNo.length),
        stakeAmount * BigInt(votersYes.length),
        stakeAmount * BigInt(votersNo.length),
      ];

      assert.deepEqual(Object.values(await dao.read.countVotes([proposalId])), expectedVotesCount);

      await addValidatorsStake(
        mockValidatorSet,
        mockStaking,
        votersNo,
        stakeAmount * 5n
      );

      assert.deepEqual(Object.values(await dao.read.countVotes([proposalId])), expectedVotesCount);
    });

    it("should return saved counting result of Declined proposal", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const voters = users.slice(5, 15);

      const { proposalId } = await createProposal(dao, users[4].account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);
      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.Yes);
      await swithPhase(dao);

      await dao.write.finalize([proposalId]);

      assert.deepEqual(
        Object.values(await dao.read.countVotes([proposalId])),
        Object.values(await dao.read.results([proposalId])),
      );
    });

    it("should return saved counting result of Accepted proposal", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const voters = users.slice(5, 15);

      const { proposalId } = await createProposal(dao, users[4].account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);
      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.No);
      await swithPhase(dao);

      await dao.write.finalize([proposalId]);

      assert.deepEqual(
        Object.values(await dao.read.countVotes([proposalId])),
        Object.values(await dao.read.results([proposalId])),
      );
    });

    it("should return saved counting result of Executed proposal", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const voters = users.slice(5, 15);

      const { proposalId } = await createProposal(dao, users[4].account, { majority: OpenProposalMajority.High });

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);
      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.Yes);
      await swithPhase(dao);

      await users[0].sendTransaction({
        value: parseEther('100'),
        to: dao.address,
      });

      await dao.write.finalize([proposalId]);
      await dao.write.execute([proposalId]);

      assert.equal((await dao.read.getProposal([proposalId])).state, ProposalState.Executed);

      assert.deepEqual(
        Object.values(await dao.read.countVotes([proposalId])),
        Object.values(await dao.read.results([proposalId])),
      );
    });
  });

  describe("finalize", async function () {
    it("should revert finalize of non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposalId = getRandomBigInt();

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.finalize([proposalId]),
        dao,
        "ProposalNotExist",
        [proposalId],
      );
    });

    it("should revert finalize of proposal with unexpected state", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.finalize([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Created],
      );
    });

    it("should finalize accepted proposal and emit event", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const voters = users.slice(10, 25);

      const { proposalId } = await createProposal(dao, proposer.account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);

      await vote(dao, proposalId, voters.slice(0, 10), Vote.Yes);
      await vote(dao, proposalId, voters.slice(12), Vote.No);

      await swithPhase(dao);

      await hhViem.assertions.emitWithArgs(
        dao.write.finalize([proposalId], { account: proposer.account }),
        dao,
        "VotingFinalized",
        [proposer.account.address, proposalId, true],
      );

      assert.equal((await dao.read.getProposal([proposalId])).state, ProposalState.Accepted);
    });

    it("should finalize accepted proposal and update statistics", async function () {
      const voters = users.slice(10, 20);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const { proposalId } = await createProposal(dao, users[1].account);

      const [, acceptedBefore, , ,] = await dao.read.statistic();

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.Yes);
      await swithPhase(dao);

      assert.ok(await dao.write.finalize([proposalId]));

      const [, acceptedAfter, , ,] = await dao.read.statistic();

      assert.equal(acceptedAfter, acceptedBefore + 1n);
    });

    it("should finalize accepted proposal and transfer fee to back to proposer", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const voters = users.slice(10, 20);

      const { proposalId } = await createProposal(dao, proposer.account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);

      await vote(dao, proposalId, voters.slice(0, 10), Vote.Yes);
      await vote(dao, proposalId, voters.slice(10), Vote.No);

      await swithPhase(dao);

      await hhViem.assertions.balancesHaveChanged(
        dao.write.finalize([proposalId]),
        [
          {
            address: dao.address,
            amount: -CreateProposalFee,
          },
          {
            address: proposer.account.address,
            amount: CreateProposalFee,
          }
        ],
      );
    });

    it("should finalize declined proposal and emit event", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[1];
      const voters = users.slice(10, 25);

      const { proposalId } = await createProposal(dao, proposer.account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);

      await vote(dao, proposalId, voters.slice(0, 10), Vote.No);
      await vote(dao, proposalId, voters.slice(10), Vote.Yes);

      await swithPhase(dao);

      await hhViem.assertions.emitWithArgs(
        dao.write.finalize([proposalId], { account: proposer.account }),
        dao,
        "VotingFinalized",
        [proposer.account.address, proposalId, false],
      );

      assert.equal((await dao.read.getProposal([proposalId])).state, ProposalState.Declined);
    });

    it("should finalize declined proposal and transfer fee to reinsert pot", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const voters = users.slice(10, 20);

      const { proposalId } = await createProposal(dao, proposer.account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);

      await vote(dao, proposalId, voters.slice(0, 10), Vote.No);
      await vote(dao, proposalId, voters.slice(10), Vote.Yes);

      await swithPhase(dao);

      await hhViem.assertions.balancesHaveChanged(
        dao.write.finalize([proposalId]),
        [
          {
            address: dao.address,
            amount: -CreateProposalFee,
          },
          {
            address: reinsertPot.account.address,
            amount: CreateProposalFee,
          }
        ]
      );
    });

    it("should finalize declined proposal and update statistics", async function () {
      const voters = users.slice(10, 20);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const { proposalId } = await createProposal(dao, users[1].account);

      const [, , declinedBefore,] = await dao.read.statistic();

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.No);
      await swithPhase(dao);

      assert.ok(await dao.write.finalize([proposalId]));

      const [, , declinedAfter,] = await dao.read.statistic();

      assert.equal(declinedAfter, declinedBefore + 1n);
    });

    it("should finalize proposal with abstain votes as declined", async function () {
      const voters = users.slice(10, 20);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const { proposalId } = await createProposal(dao, users[1].account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);
      await swithPhase(dao);

      assert.ok(await dao.write.finalize([proposalId]));

      assert.equal((await dao.read.getProposal([proposalId])).state, ProposalState.Declined);
    });
  });

  describe("execute", async function () {
    it("should revert execute of non-existing proposal", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposalId = getRandomBigInt();

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId]),
        dao,
        "ProposalNotExist",
        [proposalId],
      );
    });

    it("should revert execute of proposal with unexpected state", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const { proposalId } = await createProposal(dao, proposer.account);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Created],
      );
    });

    it("should revert execute of proposals that are outside execution window", async function () {
      const voters = users.slice(10, 25);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[4];
      const userToFund = users[5];
      const fundAmount = parseEther('1');

      const { proposalId } = await createProposal(
        dao,
        users[1].account,
        {
          description: "fund user 5",
          targets: [userToFund.account.address],
          values: [fundAmount],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.High
        }
      );

      await proposer.sendTransaction({
        to: dao.address,
        value: fundAmount
      });

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao); // switches to: voting phase 1
      await vote(dao, proposalId, voters, Vote.Yes);
      await swithPhase(dao); // switches to: proposal phase 2 (executable window)
      await swithPhase(dao); // switches to: voting phase 2 (executable window)

      assert.ok(await dao.write.finalize([proposalId]));

      await swithPhase(dao); // switches to: proposal phase 3 (outside executable window)

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId], { account: proposer.account }),
        dao,
        "OutsideExecutionWindow",
        [proposalId],
      );
    });

    it("should revert execute of declined proposal", async function () {
      const voters = users.slice(10, 25);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const { proposalId } = await createProposal(dao, users[1].account);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.No);
      await swithPhase(dao);

      assert.ok(await dao.write.finalize([proposalId]));

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Declined],
      );
    });

    it("should execute accepted proposal", async function () {
      const voters = users.slice(10, 25);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[4];
      const userToFund = users[5];
      const fundAmount = parseEther('151');

      const { proposalId } = await createProposal(
        dao,
        users[1].account,
        {
          description: "fund user 5",
          targets: [userToFund.account.address],
          values: [fundAmount],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.High
        }
      );

      await proposer.sendTransaction({
        to: dao.address,
        value: fundAmount
      });

      assert.equal(await dao.read.governancePot(), fundAmount);

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);

      await swithPhase(dao);
      await vote(dao, proposalId, voters, Vote.Yes);
      await swithPhase(dao);

      assert.ok(await dao.write.finalize([proposalId]));

      const tx = dao.write.execute([proposalId], { account: proposer.account });

      await hhViem.assertions.emitWithArgs(
        tx,
        dao,
        "ProposalExecuted",
        [proposer.account.address, proposalId],
      );

      await hhViem.assertions.balancesHaveChanged(
        tx,
        [
          {
            address: dao.address,
            amount: -fundAmount,
          },
          {
            address: userToFund.account.address,
            amount: fundAmount,
          }
        ],
      );

      assert.equal(await dao.read.governancePot(), 0n);
    });
  });

  describe("setCreateProposalFee", async function () {
    it("should revert calling function by unauthorized account", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);
      const caller = users[4];

      await hhViem.assertions.revertWithCustomError(
        dao.write.setCreateProposalFee([1n], { account: caller.account }),
        dao,
        "OnlyGovernance",
      );
    });
  });

  describe("daoPhaseCount", async function () {
    it("should confirm daoPhaseCount change", async function () {
      const { dao } = await helpers.loadFixture(deployFixture);

      assert.equal(await dao.read.daoPhaseCount(), 1n);
      await swithPhase(dao);
      await swithPhase(dao);
      assert.equal(await dao.read.daoPhaseCount(), 2n);
    });
  });
});
