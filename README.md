# DMD Diamond Smart Contracts

[![CI][ci-badge]][ci] [![Static analysis][static-analysis-badge]][static-analysis] [![Coverage][coveralls-badge]][coveralls]

This repository contains the [Solidity](https://docs.soliditylang.org/en/v0.8.25/) contracts for the DMD Diamond blockchain. The contracts implement proof-of-stake validator selection, staking rewards, and on-chain governance. The node runs Honey Badger BFT (HBBFT) consensus with the selected validators. See the [DMD Diamond white paper](https://github.com/DMDcoin/whitepaper/wiki) for the protocol design.

## Packages

- [Core contracts](core/contracts) for validator selection, staking, epoch rewards, key generation, and transaction permissions. See the [core contract reference](docs/core/src/README.md).
- [DAO contracts](docs/dao/README.md) for proposing, voting on, and executing governance decisions.
- [View contracts](docs/views/README.md) for reading staking, validator, and governance data in batches.

## Usage

### Install dependencies

Use the Node.js version in [.nvmrc](.nvmrc), [pnpm](https://pnpm.io/installation), and [Foundry](https://www.getfoundry.sh/). From the repository root, initialize the Foundry dependency and install the workspace dependencies.

```bash
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

### Build and test

```bash
pnpm run build
pnpm run test
```

To run tests for one package, use `pnpm run test:core`, `pnpm run test:dao`, or `pnpm run test:views`.

### Generate a network spec

Prepare a YAML file from [the example genesis configuration](templates/init-data.example.yaml). Use the initial validators' addresses, public keys, and HBBFT key-generation parts and acknowledgments in the same order across the validator lists.

```bash
pnpm run spec -- --init-data path/to/init-data.yaml
```

This builds the three packages and writes `spec_hbbft.json` and the `blockscout_verify.sh` verification helper in the repository root.

### Flatten the core contracts

```bash
pnpm --dir core run flat
```

The flattened Solidity files are written to `core/flat`. See the [Blockscout verification guide](https://docs.blockscout.com/devs/verification) for verification options.

### Build the documentation

See the [documentation index](docs/README.md#build-the-documentation) for the package guides and build commands.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process and [the code of conduct](CODE_OF_CONDUCT.md) for community standards.

## License

The core package uses the [Apache License 2.0](LICENSE-APACHE). The DAO and views packages use the [GNU GPL 3.0 or later](LICENSE-GPL). See [COPYRIGHT](COPYRIGHT) for the inherited POSDAO notice.

[ci]: https://github.com/DMDcoin/contracts-monorepo/actions/workflows/ci.yml
[ci-badge]: https://github.com/DMDcoin/contracts-monorepo/actions/workflows/ci.yml/badge.svg?branch=master
[static-analysis]: https://github.com/DMDcoin/contracts-monorepo/actions/workflows/static-analysis.yml
[static-analysis-badge]: https://github.com/DMDcoin/contracts-monorepo/actions/workflows/static-analysis.yml/badge.svg?branch=master
[coveralls]: https://coveralls.io/github/DMDcoin/contracts-monorepo?branch=master
[coveralls-badge]: https://coveralls.io/repos/github/DMDcoin/contracts-monorepo/badge.svg?branch=master
