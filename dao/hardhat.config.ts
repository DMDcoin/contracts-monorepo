import { defineConfig } from "hardhat/config";

import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatLedger from "@nomicfoundation/hardhat-ledger";
import hardhatFoundry from "@nomicfoundation/hardhat-foundry";
import hardhatContractSizer from "@solidstate/hardhat-contract-sizer";

import { daoTasks } from "./tasks/index.js";

import { createBaseConfig } from "../hardhat.base.js";
import { getUpgradeCalldata } from "../scripts/tasks/index.js";

const base = createBaseConfig();

export default defineConfig({
    ...base,
    plugins: [
        hardhatToolboxViem,
        hardhatLedger,
        hardhatFoundry,
        hardhatContractSizer,
    ],
    tasks: [...daoTasks, ...getUpgradeCalldata],
    paths: {
        ...base.paths,
        tests: {
            nodejs: "./test",
        },
    },
    coverage: {
        skipFiles: ["interfaces", "mocks"],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        only: [/DiamondDao/i],
        except: [/Mock/i],
    },
});
