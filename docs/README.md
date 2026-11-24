# DMD Diamond Contract Documentation

- [Core contract reference](core/src/README.md) covers staking, validator selection, epoch rewards, key generation, and transaction permissions.
- [DAO guide](dao/README.md) covers the proposal lifecycle, execution, and quorum.
- [Views guide](views/README.md) covers the aggregators, core contract addresses, and historical reads.

## Build the documentation

[Install the workspace dependencies](../README.md#install-dependencies) and run these commands from the repository root.

Use [mdBook](https://rust-lang.github.io/mdBook/guide/installation.html) to build the checked-in core reference.

```bash
mdbook build docs/core
```

Open `docs/core/book/index.html` to read the rendered reference.

Generate fresh Forge references for all three packages with one command.

```bash
pnpm run docs-build
```

The generated references are in `docs/generated/core`, `docs/generated/dao`, and `docs/generated/views`. To regenerate one package, run `pnpm --dir core run docs-build`, `pnpm --dir dao run docs-build`, or `pnpm --dir views run docs-build`.
