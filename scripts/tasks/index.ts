import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";

export const getUpgradeCalldata = [
    task("getUpgradeCalldata", "Get contract upgrade calldata to use in DAO proposal")
        .addOption({
            name: "contract",
            description: "Name of the contract to upgrade, as declared in initial-contracts.json",
            type: ArgumentType.STRING_WITHOUT_DEFAULT,
            defaultValue: undefined,
        })
        .addOption({
            name: "impl",
            description: "Address of already deployed implementation, new one is deployed if omitted",
            type: ArgumentType.STRING_WITHOUT_DEFAULT,
            defaultValue: undefined,
        })
        .addOption({
            name: "initFunc",
            description: "Initialization or reinitialization function",
            type: ArgumentType.STRING_WITHOUT_DEFAULT,
            defaultValue: undefined,
        })
        .addVariadicArgument({
            name: "initArgs",
            description: "Initialization function arguments",
            defaultValue: [],
        })
        .setAction(async () => await import("./getUpgradeCalldata.ts"))
        .build(),
];
