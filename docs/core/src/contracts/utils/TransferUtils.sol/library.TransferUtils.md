# TransferUtils
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/utils/TransferUtils.sol)


## Functions
### transferNative


```solidity
function transferNative(address recipient, uint256 amount) internal;
```

## Errors
### InsufficientBalance

```solidity
error InsufficientBalance();
```

### TransferFailed

```solidity
error TransferFailed(address recipient, uint256 amount);
```
