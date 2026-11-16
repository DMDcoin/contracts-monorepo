import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export const daoTasks = [
  task("vote-yes", "Votes yes to all available proposals")
    .setAction(async () => await import("./actions/voteYes.js"))
    .build(),

  task("deployLowMajorityContract", "deploys LowMajority contract")
    .setAction(async () => await import("./actions/deployLowMajority.js"))
    .build(),
];
