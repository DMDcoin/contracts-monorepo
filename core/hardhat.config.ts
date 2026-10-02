import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatLedger from "@nomicfoundation/hardhat-ledger";
import hardhatFoundry from "@nomicfoundation/hardhat-foundry";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatContractSizer from "@solidstate/hardhat-contract-sizer";

import { createBaseConfig } from "../hardhat.base.js";
import { getUpgradeCalldata } from "../scripts/tasks/index.js";

const mnemonic = configVariable("MNEMONIC");

const base = createBaseConfig({
    viaIR: true,
    extraNetworks: {
        local: {
            type: "http",
            chainType: "l1",
            url: "http://127.0.0.1:8540",
            accounts: {
                mnemonic: mnemonic,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
            gasPrice: 1000000000,
        },
        beta: {
            type: "http",
            chainType: "l1",
            url: "https://beta-rpc.bit.diamonds",
            accounts: {
                mnemonic: mnemonic,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
            gasPrice: 1000000000,
        },
        forked: {
            type: "http",
            chainType: "l1",
            gasPrice: 0,
            url: "http://127.0.0.1:8545",
            timeout: 1_000_000,
        },
    }
});

export default defineConfig({
    ...base,
    plugins: [
        hardhatToolboxViem,
        hardhatLedger,
        hardhatFoundry,
        hardhatContractSizer,
        hardhatVerify,
    ],
    tasks: getUpgradeCalldata,
    paths: {
        ...base.paths,
        tests: {
            nodejs: "./test",
        },
    },
    test: {
        solidity: {
            ffi: true,
        },
    },
    coverage: {
        skipFiles: ["interfaces", "mocks"],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        only: [
            /Hbbft/i,
            /KeyGenHistory/i,
            /BonusScoreSystem/i,
        ],
        except: [
            /Mock/i,
        ],
    },
    chainDescriptors: {
        17771: {
            name: "DMD Diamond",
            blockExplorers: {
                blockscout: {
                    name: "DMD Diamond Blockchain explorer",
                    url: "https://explorer.bit.diamonds/",
                    apiUrl: "https://explorer.bit.diamonds/api",
                },
            },
        },
    },
    verify: {
        blockscout: { enabled: true },
        etherscan: { enabled: false },
        sourcify: { enabled: false },
    },
});
