# DaoMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/DaoMock.sol)

**Inherits:**
[IGovernancePot](../../interfaces/IGovernancePot.sol/interface.IGovernancePot.md)


## State Variables
### phaseCounter

```solidity
uint256 public phaseCounter
```


## Functions
### switchPhase


```solidity
function switchPhase() external;
```

### receive


```solidity
receive() external payable;
```

## Errors
### SwitchPhaseReverted

```solidity
error SwitchPhaseReverted();
```
