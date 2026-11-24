# IBonusScoreSystem
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/interfaces/IBonusScoreSystem.sol)


## Functions
### getValidatorScore


```solidity
function getValidatorScore(address mining) external view returns (uint256);
```

### rewardStandBy


```solidity
function rewardStandBy(address mining, uint256 time) external;
```

### penaliseNoStandBy


```solidity
function penaliseNoStandBy(address mining, uint256 time) external;
```

### penaliseNoKeyWrite


```solidity
function penaliseNoKeyWrite(address mining) external;
```

### penaliseBadPerformance


```solidity
function penaliseBadPerformance(address mining, uint256 time) external;
```

### resetBonusScore


```solidity
function resetBonusScore(address mining) external;
```
