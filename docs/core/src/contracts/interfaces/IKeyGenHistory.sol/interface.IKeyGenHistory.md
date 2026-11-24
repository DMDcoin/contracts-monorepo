# IKeyGenHistory
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/interfaces/IKeyGenHistory.sol)


## Functions
### clearPrevKeyGenState


```solidity
function clearPrevKeyGenState(address[] calldata) external;
```

### getAcksLength


```solidity
function getAcksLength(address val) external view returns (uint256);
```

### getPart


```solidity
function getPart(address val) external view returns (bytes memory);
```

### getCurrentKeyGenRound


```solidity
function getCurrentKeyGenRound() external view returns (uint256);
```

### getNumberOfKeyFragmentsWritten


```solidity
function getNumberOfKeyFragmentsWritten() external view returns (uint128, uint128);
```

### notifyNewEpoch


```solidity
function notifyNewEpoch() external;
```

### notifyKeyGenFailed


```solidity
function notifyKeyGenFailed() external;
```
