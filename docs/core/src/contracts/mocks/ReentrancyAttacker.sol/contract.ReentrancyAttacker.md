# ReentrancyAttacker
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/ReentrancyAttacker.sol)


## State Variables
### bonusScoreSystem

```solidity
IBonusScoreSystem public bonusScoreSystem
```


### timeArgValue

```solidity
uint256 public timeArgValue
```


### funcId

```solidity
bytes4 public funcId
```


## Functions
### setFuncId


```solidity
function setFuncId(bytes4 id) external;
```

### setBonusScoreContract


```solidity
function setBonusScoreContract(address _bonusScoreSystem) external;
```

### attack


```solidity
function attack(address mining, uint256 time) public;
```

### stakingFixedEpochDuration


```solidity
function stakingFixedEpochDuration() external pure returns (uint256);
```

### updatePoolLikelihood


```solidity
function updatePoolLikelihood(address mining, uint256) external;
```
