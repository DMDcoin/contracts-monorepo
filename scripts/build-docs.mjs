import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const [packageName, ...forgeArgs] = process.argv.slice(2);
const homepages = {
    core: "docs/core/src/README.md",
    dao: "docs/dao/README.md",
    views: "docs/views/README.md",
};
if (!Object.hasOwn(homepages, packageName)) {
    throw new Error("Expected a workspace package name (core, dao, or views).");
}

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
    args: forgeArgs,
    options: { out: { type: "string", short: "o" } },
    strict: false,
    allowPositionals: true,
});
const defaultOutput = process.env.FOUNDRY_DOC_OUT ?? "docs/generated/" + packageName;

// Use the Git root so Forge includes the package directory in its source links.
const result = spawnSync("forge", ["doc", "--root", repositoryRoot, ...forgeArgs], {
    cwd: repositoryRoot,
    env: {
        ...process.env,
        FOUNDRY_SRC: packageName + "/contracts",
        FOUNDRY_AUTO_DETECT_REMAPPINGS: "false",
        FOUNDRY_REMAPPINGS: [
            "@openzeppelin/=" + packageName + "/node_modules/@openzeppelin/",
            "diamond-contracts-core/=core/",
            "diamond-contracts-dao/=dao/",
            "forge-std/=lib/forge-std/src/",
        ].join("\n"),
        FOUNDRY_DOC_REPOSITORY: "https://github.com/DMDcoin/contracts-monorepo",
        FOUNDRY_DOC_HOMEPAGE: homepages[packageName],
        FOUNDRY_DOC_OUT: defaultOutput,
    },
    stdio: "inherit",
});

if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;

if (result.status === 0 && !forgeArgs.includes("--help") && !forgeArgs.includes("-h")) {
    // Vocs generates an edit link for each generated page, which has no tracked file to edit.
    const config = resolve(repositoryRoot, values.out ?? defaultOutput, "vocs.config.ts");
    if (existsSync(config)) {
        const original = readFileSync(config, "utf8");
        const updated = original.replace(
            /^  editLink: \{ pattern: 'https:\/\/github\.com\/DMDcoin\/contracts-monorepo\/edit\/[^']+\/\{path\}' \},\r?\n/m,
            "",
        );
        if (updated !== original) {
            writeFileSync(config, updated);
        }
    }
}
