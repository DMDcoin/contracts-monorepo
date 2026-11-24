# BlockRewardHbbftMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/BlockRewardHbbftMock.sol)

**Inherits:**
[BlockRewardHbbft](../../BlockRewardHbbft.sol/contract.BlockRewardHbbft.md)


## Functions
### sendCoins


```solidity
function sendCoins() external payable;
```

### setConnectivityTracker


```solidity
function setConnectivityTracker(address _connectivityTracker) external;
```

### setGovernanceAddress


```solidity
function setGovernanceAddress(address _address) external;
```

### resetEarlyEpochEnd


```solidity
function resetEarlyEpochEnd() external;
```

### getPotsShares


```solidity
function getPotsShares(uint256 numValidators) external view returns (PotsShares memory);
```
