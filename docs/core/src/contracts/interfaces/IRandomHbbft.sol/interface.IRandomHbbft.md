# IRandomHbbft
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/interfaces/IRandomHbbft.sol)


## Functions
### currentSeed


```solidity
function currentSeed() external view returns (uint256);
```

### getSeedHistoric


```solidity
function getSeedHistoric(uint256 _blocknumber) external view returns (uint256);
```

### getSeedsHistoric


```solidity
function getSeedsHistoric(uint256[] calldata) external view returns (uint256[] memory);
```

### isFullHealth


```solidity
function isFullHealth() external view returns (bool);
```

### isFullHealthHistoric


```solidity
function isFullHealthHistoric(uint256) external view returns (bool);
```

### isFullHealthsHistoric


```solidity
function isFullHealthsHistoric(uint256[] calldata) external view returns (bool[] memory);
```
