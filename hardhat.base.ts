import { english, generateMnemonic } from "viem/accounts";
import { parseEther } from "viem";
import type { HardhatUserConfig } from "hardhat/config";
import { configVariable } from "hardhat/config";

type NetworksConfig = NonNullable<HardhatUserConfig["networks"]>;

interface BaseConfigOptions {
    viaIR?: boolean;
    defaultGasPrice?: number;
    extraNetworks?: NetworksConfig;
}

// Set encrypted variables using:
// pnpm hardhat keystore set DEV_DEPLOYER_PRIVATE_KEY
// pnpm hardhat keystore set MNEMONIC
const accounts = [configVariable("DEV_DEPLOYER_PRIVATE_KEY")];
const mnemonic = configVariable("MNEMONIC");
const testMnemonic = generateMnemonic(english);

export function createBaseConfig({
    viaIR = false,
    extraNetworks = {},
}: BaseConfigOptions = {}): Pick<
    HardhatUserConfig,
    "solidity" | "networks" | "paths"
> {
    // Besides "default" compilation profile, hardhat 3 generates its own
    // "production" profile, which differes from one specified below.
    // So this config needs to be explicitly used for both.
    const compiler = {
        version: "0.8.25",
        settings: {
            optimizer: {
                enabled: true,
                runs: 800,
                details: {
                    yul: true,
                },
            },
            evmVersion: "london",
            viaIR,
        },
    };

    return {
        solidity: {
            npmFilesToBuild: [
                "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
                "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
                "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
            ],
            profiles: {
                default: compiler,
                production: { ...compiler, isolated: true },
            },
        },
        networks: {
            default: {
                type: "edr-simulated",
                accounts: {
                    count: 100,
                    mnemonic: testMnemonic,
                    accountsBalance: parseEther("1000000000"),
                },
                chainId: 31337,
                allowUnlimitedContractSize: true,
                hardfork: "istanbul",
                minGasPrice: 0,
            },
            mainnet: {
                type: "http",
                chainType: "l1",
                url: "https://rpc.bit.diamonds",
                chainId: 17771,
                accounts: accounts,
            },
            testnet: {
                type: "http",
                chainType: "l1",
                url: "http://62.171.133.46:20100",
                accounts: {
                    mnemonic: mnemonic,
                    path: "m/44'/60'/0'/0",
                    initialIndex: 0,
                    count: 20,
                    passphrase: "",
                },
                gasPrice: 1_000_000_000,
            },
            ...extraNetworks,
        },
        paths: {
            sources: "./contracts",
        },
    };
}
