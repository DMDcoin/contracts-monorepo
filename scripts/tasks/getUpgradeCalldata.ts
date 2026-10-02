import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { NewTaskActionFunction } from "hardhat/types/tasks";
import {
    createPublicClient,
    createWalletClient,
    custom,
    encodeFunctionData,
    getAddress,
    parseAbi,
    type Address,
    type Hex,
} from "viem";

import { repositoryRoot } from "../spec/artifacts.ts";
import { ContractRegistry } from "../spec/registry.ts";

// bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
const ERC1967AdminSlot: Hex = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const ProxyAdminAbi = parseAbi([
    "function upgradeAndCall(address proxy, address implementation, bytes data) payable",
]);

interface GetUpgradeCalldataArgs {
    contract?: string;
    impl?: string;
    initFunc?: string;
    initArgs: string[];
}

interface ProposalData {
    contract: string;
    calldata: Hex;
    target: Address;
}

function getGitRef(): string {
    const git = (command: string) =>
        execSync(`git ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

    try {
        return git("describe --tags --exact-match HEAD");
    } catch {
        return git("rev-parse --short HEAD");
    }
}

const getUpgradeCalldata: NewTaskActionFunction<GetUpgradeCalldataArgs> = async (
    { contract, impl, initFunc, initArgs },
    hre,
) => {
    const registry = ContractRegistry.fromFile(path.join(repositoryRoot, "initial-contracts.json"));
    const entry = registry.contracts.find((x) => x.name === contract);
    if (entry === undefined) {
        throw new Error(`${contract} is unknown`);
    }

    await hre.tasks.getTask("build").run({ quiet: true, noTests: true });

    const { networkName, provider } = await hre.network.getOrCreate();
    const publicClient = createPublicClient({ transport: custom(provider) });
    const walletClient = createWalletClient({ transport: custom(provider) });

    const artifact = await hre.artifacts.readArtifact(entry.name);

    let implementationAddress = impl as Address | undefined;
    if (implementationAddress === undefined) {
        const [deployer] = await walletClient.getAddresses();

        console.log("using address for deployment: ", deployer);

        const hash = await walletClient.deployContract({
            abi: artifact.abi,
            bytecode: artifact.bytecode as Hex,
            account: deployer,
            chain: null,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        implementationAddress = receipt.contractAddress!;
    }

    let initCalldata: Hex = "0x";
    if (initFunc !== undefined) {
        initCalldata = encodeFunctionData({
            abi: artifact.abi,
            functionName: initFunc,
            args: initArgs,
        });
    }

    const adminSlotValue = await publicClient.getStorageAt({ address: entry.proxyAddress, slot: ERC1967AdminSlot });

    const proposal: ProposalData = {
        contract: entry.name,
        calldata: encodeFunctionData({
            abi: ProxyAdminAbi,
            functionName: "upgradeAndCall",
            args: [entry.proxyAddress, implementationAddress, initCalldata],
        }),
        target: getAddress(`0x${adminSlotValue!.slice(-40)}`),
    };

    const outputDir = path.join(repositoryRoot, "scripts", "upgrades", networkName);
    const outputFile = path.join(outputDir, `${getGitRef()}.json`);

    const proposals: ProposalData[] = fs.existsSync(outputFile)
        ? JSON.parse(fs.readFileSync(outputFile, "utf-8"))
        : [];
    proposals.push(proposal);

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(proposals, null, 2) + "\n");

    console.log("contract:", proposal.contract);
    console.log("calldata:", proposal.calldata);
    console.log("  target:", proposal.target);
    console.log("out file:", outputFile);
};

export default getUpgradeCalldata;
