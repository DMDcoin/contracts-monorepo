# DMD Diamond View Contracts

The aggregators batch reads across the DMD Diamond contracts so clients can fetch related values in a single call.

- [DMDAggregator](../../views/contracts/Aggregator.sol) reads validator and pool data, staking balances, pending withdrawals, connectivity, bonus scores, and DAO proposals.
- [DMDAggregatorUpgradeable](../../views/contracts/AggregatorUpgradeable.sol) provides the core staking and validator views. The [genesis contract registry](../../initial-contracts.json) includes its proxy.

## Historical reads

To query at a historical block, use an RPC endpoint that serves state at that block. The aggregator and the contracts it calls must already be deployed and configured at the requested block.

## Core contract addresses

The [genesis contract registry](../../initial-contracts.json) lists the core proxy addresses, including the inputs used to configure the aggregators.

- `StakingHbbft` uses `0x1100000000000000000000000000000000000001`.
- `ValidatorSetHbbft` uses `0x1000000000000000000000000000000000000001`.
- `TxPermissionHbbft` uses `0x4000000000000000000000000000000000000001`.
