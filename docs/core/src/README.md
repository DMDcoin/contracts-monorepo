# DMD Diamond Core Contracts

These contracts manage staking and the validator set used by the DMD Diamond node's Honey Badger BFT (HBBFT) consensus. See the [DMD Diamond white paper](https://github.com/DMDcoin/whitepaper/wiki) for the protocol design.

## Contract summaries

- [ValidatorSetHbbft](contracts/ValidatorSetHbbft.sol/contract.ValidatorSetHbbft.md) tracks active and pending validators and selects the next set from eligible staking pools.
- [StakingHbbft](contracts/StakingHbbft.sol/contract.StakingHbbft.md) manages pools, stakes, withdrawals, and the restaking of epoch rewards for validators and delegators.
- [BlockRewardHbbft](contracts/BlockRewardHbbft.sol/contract.BlockRewardHbbft.md) distributes epoch rewards, snapshots pool stakes for the next epoch, and coordinates validator set transitions.
- [RandomHbbft](contracts/RandomHbbft.sol/contract.RandomHbbft.md) stores the engine's random seed for each block. Validator selection uses the seed when sampling eligible pools.
- [KeyGenHistory](contracts/KeyGenHistory.sol/contract.KeyGenHistory.md) records the parts and acknowledgments submitted by pending validators during HBBFT key generation.
- [ConnectivityTrackerHbbft](contracts/ConnectivityTrackerHbbft.sol/contract.ConnectivityTrackerHbbft.md) processes validator connectivity reports and can request an early end to the staking epoch.
- [BonusScoreSystem](contracts/BonusScoreSystem.sol/contract.BonusScoreSystem.md) tracks validator bonus scores used to weight selection.
- [CertifierHbbft](contracts/CertifierHbbft.sol/contract.CertifierHbbft.md) identifies explicitly certified accounts and registered mining addresses for zero-gas-price transaction checks.
- [TxPermissionHbbft](contracts/TxPermissionHbbft.sol/contract.TxPermissionHbbft.md) determines which transaction types the node may accept. It checks validator service calls such as `writePart` and `writeAcks`.
- [ValueGuards](contracts/lib/ValueGuards.sol/abstract.ValueGuards.md) checks proposed values for configurable ecosystem parameters against their allowed values.

Browse the [full contract reference](contracts/README.md) for interfaces, libraries, and mocks. Build and test commands are in the [monorepo README](https://github.com/DMDcoin/contracts-monorepo#usage).
