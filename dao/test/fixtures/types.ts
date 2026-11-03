import type { ContractReturnType } from "@nomicfoundation/hardhat-viem/types";

import type { } from "../../artifacts/contracts/DiamondDao.sol/artifacts.js";
import type { } from "../../artifacts/contracts/DiamondDaoLowMajority.sol/artifacts.js";

import type { } from "../../artifacts/contracts/mocks/MockDiamondDaoLowMajority.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockEtherReceiver.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockProposer.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockQuorumCalculator.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockStakingHbbft.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockTokens.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/MockValidatorSetHbbft.sol/artifacts.js";
import type { } from "../../artifacts/contracts/mocks/ReentrancyAttacker.sol/artifacts.js";

import type { } from "../../artifacts/@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol/artifacts.js";

export type DiamondDao = ContractReturnType<"DiamondDao">;
export type DiamondDaoLowMajority = ContractReturnType<"DiamondDaoLowMajority">;
export type ProxyAdmin = ContractReturnType<"ProxyAdmin">;

export type MockDiamondDaoLowMajority = ContractReturnType<"MockDiamondDaoLowMajority">;
export type MockStakingHbbft = ContractReturnType<"MockStakingHbbft">;
export type MockValidatorSetHbbft = ContractReturnType<"MockValidatorSetHbbft">;
export type MockEtherReceiver = ContractReturnType<"MockEtherReceiver">;
export type MockProposer = ContractReturnType<"MockProposer">;
export type MockERC20 = ContractReturnType<"MockERC20">;
export type MockERC721 = ContractReturnType<"MockERC721">;
export type MockERC1155 = ContractReturnType<"MockERC1155">;
export type MockQuorumCalculator = ContractReturnType<"MockQuorumCalculator">;
export type ReentrancyAttacker = ContractReturnType<"ReentrancyAttacker">;
export type ReentrancyAttackerLowMajority = ContractReturnType<"ReentrancyAttackerLowMajority">;

export enum DaoPhase {
  Proposal,
  Voting
}
