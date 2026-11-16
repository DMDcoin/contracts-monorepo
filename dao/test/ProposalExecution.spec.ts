import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import hre from "hardhat";

import { type Address, concat, encodeFunctionData, getAddress, type Hex, parseEther } from "viem";

import {
  addressFromStorageSlot,
  deployProxy,
  ERC1967AdminSlot,
  ERC1967ImplementationSlot,
} from "./fixtures/proxy.js";
import { createRandomWallet } from "./fixtures/wallet.js";

import {
  createProposal,
  OpenProposalMajority,
  ProposalState,
  ProposalType,
  Vote,
} from "./fixtures/proposal.js";

import { DiamondDao, MockStakingHbbft, MockValidatorSetHbbft } from "./fixtures/types.js";
import { EmptyBytes, getRandomBigInt } from "./fixtures/utils.js";

const connection = await hre.network.getOrCreate();
const { viem: hhViem, networkHelpers: helpers } = connection;

const publicClient = await hhViem.getPublicClient();
type TestWalletClient = Awaited<ReturnType<typeof hhViem.getWalletClients>>[number];

describe("DAO proposal execution", function () {
  let users: TestWalletClient[];
  let owner: TestWalletClient;
  let reinsertPot: TestWalletClient;

  const createProposalFee = parseEther("10");
  const governancePotValue = parseEther("500");

  before(async () => {
    const signers = await hhViem.getWalletClients();

    owner = signers[0];
    reinsertPot = signers[1];
    users = signers.slice(2);
  });

  async function deployFixture() {
    const mockValidatorSet = await hhViem.deployContract("MockValidatorSetHbbft");
    const mockStaking = await hhViem.deployContract("MockStakingHbbft", [mockValidatorSet.address]);

    const mockTxPermission = createRandomWallet().address;
    const mockBonusScore = createRandomWallet().address;

    const daoLowMajority = await deployProxy(hhViem, "MockDiamondDaoLowMajority", {
      initArgs: [owner.account.address],
      initializer: "initialize",
    });

    const startTime = await helpers.time.latest();

    const dao = await deployProxy(hhViem, "DiamondDao", {
      initArgs: [
        owner.account.address,
        mockValidatorSet.address,
        mockStaking.address,
        reinsertPot.account.address,
        mockTxPermission,
        mockBonusScore,
        daoLowMajority.address,
        createProposalFee,
        startTime + 10,
      ],
      initializer: "initialize",
    });

    await daoLowMajority.write.setMainDaoAddress([dao.address]);

    await helpers.setBalance(owner.account.address, governancePotValue * 10n);

    await owner.sendTransaction({
      value: governancePotValue,
      to: dao.address,
    });

    await owner.sendTransaction({
      value: governancePotValue,
      to: daoLowMajority.address,
    });

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
    const stake = stakeAmount ? stakeAmount : parseEther("10");

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

  async function finalizedProposal(
    dao: DiamondDao,
    mockValidatorSet: MockValidatorSetHbbft,
    mockStaking: MockStakingHbbft,
    _vote: Vote,
    targets?: Address[],
    values?: bigint[],
    calldatas?: Hex[]
  ) {
    const proposer = users[2];
    const voters = users.slice(10, 25);

    const { proposalId } = await createProposal(
      dao,
      proposer.account,
      {
        description: getRandomBigInt().toString(),
        targets,
        values,
        calldatas,
        createProposalFee,
      }
    );

    await swithPhase(dao);
    await addValidatorsStake(mockValidatorSet, mockStaking, voters);
    await vote(dao, proposalId, voters, _vote);

    await swithPhase(dao);

    await dao.write.finalize([proposalId]);

    return { proposalId, proposer };
  }

  describe("self function calls", async function () {
    it("should not allow to set createProposalFee = 0", async function () {
      const proposer = users[2];
      const { dao } = await helpers.loadFixture(deployFixture);

      const newVal = 0n;
      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [newVal],
      });

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.propose(
          [
            [dao.address],
            [0n],
            [calldata],
            "title",
            "test",
            "url",
            OpenProposalMajority.Low,
          ],
          { value: createProposalFee, account: proposer.account },
        ),
        dao,
        "NewValueOutOfRange",
        [newVal],
      );
    });

    it("should update createProposalFee using proposal", async function () {
      const proposer = users[2];
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);
      const newFeeValue = parseEther("20");
      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [newFeeValue],
      });

      const { proposalId } = await finalizedProposal(
        dao,
        mockValidatorSet,
        mockStaking,
        Vote.Yes,
        [dao.address],
        [0n],
        [calldata]
      );

      await hhViem.assertions.emitWithArgs(
        dao.write.execute([proposalId], { account: proposer.account }),
        dao,
        "SetCreateProposalFee",
        [newFeeValue],
      );

      assert.equal(await dao.read.createProposalFee(), newFeeValue);
    });

    it("should update createProposalFee and refund original fee to proposers", async function () {
      const firstProposer = users[2];
      const secondProposer = users[3];
      const voters = users.slice(5, 15);

      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const originalFeeValue = createProposalFee;
      const newFeeValue = parseEther("20");
      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [newFeeValue],
      });

      const { proposalId: firstProposalId } = await createProposal(
        dao,
        firstProposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [dao.address],
          values: [0n],
          calldatas: [calldata],
          createProposalFee,
        }
      );

      const { proposalId: secondProposalId } = await createProposal(
        dao,
        secondProposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [dao.address],
          values: [0n],
          calldatas: [calldata],
          createProposalFee,
        }
      );

      await addValidatorsStake(mockValidatorSet, mockStaking, voters);
      await swithPhase(dao);
      await vote(dao, firstProposalId, voters, Vote.Yes);
      await vote(dao, secondProposalId, voters, Vote.Yes);
      await swithPhase(dao);

      await hhViem.assertions.balancesHaveChanged(
        dao.write.finalize([firstProposalId]),
        [
          {
            address: dao.address,
            amount: -originalFeeValue,
          },
          {
            address: firstProposer.account.address,
            amount: originalFeeValue,
          },
        ],
      );

      await hhViem.assertions.emitWithArgs(
        dao.write.execute([firstProposalId], { account: firstProposer.account }),
        dao,
        "SetCreateProposalFee",
        [newFeeValue],
      );

      assert.equal(await dao.read.createProposalFee(), newFeeValue);

      // even after fee is changed the user should get his original fee back
      await hhViem.assertions.balancesHaveChanged(
        dao.write.finalize([secondProposalId]),
        [
          {
            address: dao.address,
            amount: -originalFeeValue,
          },
          {
            address: secondProposer.account.address,
            amount: originalFeeValue,
          },
        ],
      );
    });

    it("should classify createProposalFee update with non-zero value as ContractUpgrade", async function () {
      const proposer = users[2];
      const { dao } = await helpers.loadFixture(deployFixture);

      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [parseEther("20")],
      });

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [dao.address],
          values: [parseEther("1")],
          calldatas: [calldata],
          createProposalFee,
        }
      );

      assert.equal(
        (await dao.read.getProposal([proposalId])).proposalType,
        ProposalType.ContractUpgrade,
      );
    });
  });

  describe("self upgrade", async function () {
    it("should perform DAO self upgrade", async function () {
      const proposer = users[2];
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const daoAddress = dao.address;

      const proxyAdminAddress = addressFromStorageSlot(
        await helpers.getStorageAt(daoAddress, ERC1967AdminSlot),
      );
      const proxyAdmin = await hhViem.getContractAt("ProxyAdmin", proxyAdminAddress);

      await proxyAdmin.write.transferOwnership([daoAddress], { account: owner.account });
      assert.equal(
        getAddress(await proxyAdmin.read.owner()),
        getAddress(daoAddress),
      );

      const newImplementation = await hhViem.deployContract("DiamondDao");

      assert.notEqual(getAddress(daoAddress), getAddress(newImplementation.address));

      const calldata = encodeFunctionData({
        abi: proxyAdmin.abi,
        functionName: "upgradeAndCall",
        args: [daoAddress, newImplementation.address, EmptyBytes],
      });

      const { proposalId } = await finalizedProposal(
        dao,
        mockValidatorSet,
        mockStaking,
        Vote.Yes,
        [proxyAdmin.address],
        [0n],
        [calldata]
      );

      await hhViem.assertions.emitWithArgs(
        dao.write.execute([proposalId], { account: proposer.account }),
        dao,
        "ProposalExecuted",
        [proposer.account.address, proposalId],
      );

      const implementationAddress = addressFromStorageSlot(
        await helpers.getStorageAt(daoAddress, ERC1967ImplementationSlot),
      );

      assert.equal(
        getAddress(implementationAddress),
        getAddress(newImplementation.address),
      );
    });
  });

  describe("funds transfer from governance pot", async function () {
    it("should revert funding with insufficient governance pot balance", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue * 2n;
      const fundsReceiver = users[12];

      const { proposalId, proposer } = await finalizedProposal(
        dao,
        mockValidatorSet,
        mockStaking,
        Vote.Yes,
        [fundsReceiver.account.address],
        [fundsRequest],
        [EmptyBytes]
      );

      await hhViem.assertions.revertWithCustomError(
        dao.write.execute([proposalId], { account: proposer.account }),
        dao,
        "FailedInnerCall",
      );
    });

    it("should transfer funds from governance pot and confirm Open proposalType", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue;
      const fundsReceiver = users[12];

      const { proposalId } = await finalizedProposal(
        dao,
        mockValidatorSet,
        mockStaking,
        Vote.Yes,
        [fundsReceiver.account.address],
        [fundsRequest],
        [EmptyBytes]
      );

      assert.equal(
        (await dao.read.getProposal([proposalId])).proposalType,
        ProposalType.OpenLowMajority,
      );

      await hhViem.assertions.balancesHaveChanged(
        dao.write.execute([proposalId]),
        [
          {
            address: daoLowMajority.address,
            amount: -fundsRequest,
          },
          {
            address: fundsReceiver.account.address,
            amount: fundsRequest,
          },
        ],
      );
    });
  });

  describe("mixed operation within proposal", async function () {
    it("should classify proposal as OpenHighMajority regardless of operations order", async function () {
      const proposer = users[2];
      const fundsReceiver = users[12];
      const { dao } = await helpers.loadFixture(deployFixture);

      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [parseEther("20")],
      });

      const { proposalId: transferFirstId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address, dao.address],
          values: [governancePotValue, 0n],
          calldatas: [EmptyBytes, calldata],
          createProposalFee,
        }
      );

      const { proposalId: parameterChangeFirstId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [dao.address, fundsReceiver.account.address],
          values: [0n, governancePotValue],
          calldatas: [calldata, EmptyBytes],
          createProposalFee,
        }
      );

      for (const proposalId of [transferFirstId, parameterChangeFirstId]) {
        assert.equal(
          (await dao.read.getProposal([proposalId])).proposalType,
          ProposalType.OpenHighMajority,
        );
      }
    });

    it("should not allow to transfer from governance with low majority quorum", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const fundsReceiver = users[12];
      const votersYes = users.slice(10, 20); // 10
      const votersNo = users.slice(20, 25); // 5

      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [parseEther("20")],
      });

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address, dao.address],
          values: [governancePotValue, 0n],
          calldatas: [EmptyBytes, calldata],
          majority: OpenProposalMajority.Low,
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);
      await dao.write.finalize([proposalId]);

      const proposalData = await dao.read.getProposal([proposalId]);

      assert.equal(proposalData.proposalType, ProposalType.OpenHighMajority);
      assert.equal(proposalData.state, ProposalState.Declined);

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId], { account: proposer.account }),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Declined],
      );

      assert.equal(await dao.read.governancePot(), governancePotValue);
      assert.equal(await dao.read.createProposalFee(), createProposalFee);
    });

    it("should transfer funds from governance pot with high majority quorum", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const proposer = users[2];
      const fundsReceiver = users[12];
      const votersYes = users.slice(10, 22); // 12
      const votersNo = users.slice(22, 25); // 3

      const newFeeValue = parseEther("20");
      const calldata = encodeFunctionData({
        abi: dao.abi,
        functionName: "setCreateProposalFee",
        args: [newFeeValue],
      });

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address, dao.address],
          values: [governancePotValue, 0n],
          calldatas: [EmptyBytes, calldata],
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);
      await dao.write.finalize([proposalId]);

      assert.equal((await dao.read.getProposal([proposalId])).state, ProposalState.Accepted);

      const lowMajorityDaoBalanceBefore = await publicClient.getBalance({
        address: daoLowMajority.address,
      });

      await hhViem.assertions.balancesHaveChanged(
        dao.write.execute([proposalId]),
        [
          {
            address: dao.address,
            amount: -governancePotValue,
          },
          {
            address: fundsReceiver.account.address,
            amount: governancePotValue,
          },
        ],
      );

      assert.equal(await dao.read.createProposalFee(), newFeeValue);
      assert.equal(
        await publicClient.getBalance({ address: daoLowMajority.address }),
        lowMajorityDaoBalanceBefore,
      );
    });
  });

  describe("reentrancy protection", async function () {
    it("should revert reentrant calls to execute", async function () {
      const { dao, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const attacker = await hhViem.deployContract("ReentrancyAttacker", [dao.address]);

      const { proposalId } = await finalizedProposal(
        dao,
        mockValidatorSet,
        mockStaking,
        Vote.Yes,
        [attacker.address],
        [parseEther("50")],
        [EmptyBytes]
      );

      await attacker.write.setId([proposalId]);

      await hhViem.assertions.revertWithCustomError(
        attacker.write.attack(),
        dao,
        "ReentrancyGuardReentrantCall",
      );
    });
  });

  describe("open proposal with low majority", async function () {
    it("should transfer funds from low majority dao pot", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue;
      const fundsReceiver = users[12];

      const proposer = users[2];
      const votersYes = users.slice(10, 20); // 10
      const votersNo = users.slice(20, 25); // 5

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address],
          values: [fundsRequest],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.Low,
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);

      await dao.write.finalize([proposalId]);

      assert.equal(
        (await dao.read.getProposal([proposalId])).proposalType,
        ProposalType.OpenLowMajority,
      );

      const mainDaoBalanceBefore = await publicClient.getBalance({ address: dao.address });

      await hhViem.assertions.balancesHaveChanged(
        dao.write.execute([proposalId]),
        [
          {
            address: daoLowMajority.address,
            amount: -fundsRequest,
          },
          {
            address: fundsReceiver.account.address,
            amount: fundsRequest,
          },
        ],
      );

      assert.equal(
        await publicClient.getBalance({ address: dao.address }),
        mainDaoBalanceBefore,
      );
    });

    it("should decline proposal if low majority quorum not reached", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue;
      const fundsReceiver = users[12];

      const proposer = users[2];
      const votersYes = users.slice(10, 19); // 9
      const votersNo = users.slice(19, 25); // 6

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address],
          values: [fundsRequest],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.Low,
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);

      await dao.write.finalize([proposalId]);

      const proposalData = await dao.read.getProposal([proposalId]);

      assert.equal(proposalData.proposalType, ProposalType.OpenLowMajority);
      assert.equal(proposalData.state, ProposalState.Declined);

      const mainDaoBalanceBefore = await publicClient.getBalance({ address: dao.address });
      const lowMajorityDaoBalanceBefore = await publicClient.getBalance({
        address: daoLowMajority.address,
      });

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Declined],
      );

      assert.equal(
        await publicClient.getBalance({ address: dao.address }),
        mainDaoBalanceBefore,
      );
      assert.equal(
        await publicClient.getBalance({ address: daoLowMajority.address }),
        lowMajorityDaoBalanceBefore,
      );
    });
  });

  describe("open proposal with high majority", async function () {
    it("should transfer funds from high majority dao pot", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue;
      const fundsReceiver = users[12];

      const proposer = users[2];
      const votersYes = users.slice(10, 22); // 12
      const votersNo = users.slice(22, 25); // 3

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address],
          values: [fundsRequest],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.High,
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);
      await dao.write.finalize([proposalId]);

      assert.equal(
        (await dao.read.getProposal([proposalId])).proposalType,
        ProposalType.OpenHighMajority,
      );

      const lowMajorityDaoBalanceBefore = await publicClient.getBalance({
        address: daoLowMajority.address,
      });

      await hhViem.assertions.balancesHaveChanged(
        dao.write.execute([proposalId]),
        [
          {
            address: dao.address,
            amount: -fundsRequest,
          },
          {
            address: fundsReceiver.account.address,
            amount: fundsRequest,
          },
        ],
      );

      assert.equal(
        await publicClient.getBalance({ address: daoLowMajority.address }),
        lowMajorityDaoBalanceBefore,
      );
    });

    it("should decline proposal if low majority quorum not reached", async function () {
      const { dao, daoLowMajority, mockValidatorSet, mockStaking } = await helpers.loadFixture(deployFixture);

      const fundsRequest = governancePotValue;
      const fundsReceiver = users[12];

      const proposer = users[2];
      const votersYes = users.slice(10, 21); // 11
      const votersNo = users.slice(21, 25); // 4

      const { proposalId } = await createProposal(
        dao,
        proposer.account,
        {
          description: getRandomBigInt().toString(),
          targets: [fundsReceiver.account.address],
          values: [fundsRequest],
          calldatas: [EmptyBytes],
          majority: OpenProposalMajority.High,
          createProposalFee,
        }
      );

      await swithPhase(dao);
      await addValidatorsStake(mockValidatorSet, mockStaking, [...votersYes, ...votersNo]);
      await vote(dao, proposalId, votersYes, Vote.Yes);
      await vote(dao, proposalId, votersNo, Vote.No);

      await swithPhase(dao);
      await dao.write.finalize([proposalId]);

      const proposalData = await dao.read.getProposal([proposalId]);

      assert.equal(proposalData.proposalType, ProposalType.OpenHighMajority);
      assert.equal(proposalData.state, ProposalState.Declined);

      const mainDaoBalanceBefore = await publicClient.getBalance({ address: dao.address });
      const lowMajorityDaoBalanceBefore = await publicClient.getBalance({
        address: daoLowMajority.address,
      });

      await hhViem.assertions.revertWithCustomErrorWithArgs(
        dao.write.execute([proposalId]),
        dao,
        "UnexpectedProposalState",
        [proposalId, ProposalState.Declined],
      );

      assert.equal(
        await publicClient.getBalance({ address: dao.address }),
        mainDaoBalanceBefore,
      );
      assert.equal(
        await publicClient.getBalance({ address: daoLowMajority.address }),
        lowMajorityDaoBalanceBefore,
      );
    });
  });
});
