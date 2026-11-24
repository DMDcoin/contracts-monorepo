# ValueGuardsMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/ValueGuardsMock.sol)

**Inherits:**
Initializable, OwnableUpgradeable, [ValueGuards](../../lib/ValueGuards.sol/abstract.ValueGuards.md)


## State Variables
### valueA

```solidity
uint256 public valueA
```


### valueB

```solidity
uint256 private valueB
```


### valueC

```solidity
uint256 public valueC
```


## Functions
### initialize


```solidity
function initialize(
    uint256 _initialValueA,
    uint256 _initialValueB,
    uint256[] memory allowedRangeValueA,
    uint256[] memory allowedRangeValueB
) external initializer;
```

### setValueA


```solidity
function setValueA(uint256 _val) external onlyOwner withinAllowedRange(_val);
```

### setValueB


```solidity
function setValueB(uint256 _val) external onlyOwner withinAllowedRange(_val);
```

### setUnprotectedValueC


```solidity
function setUnprotectedValueC(uint256 _val) external onlyOwner;
```

### getValueB


```solidity
function getValueB() external view returns (uint256);
```

### initAllowedChangableParam


```solidity
function initAllowedChangableParam(
    bytes4 setter,
    bytes4 getter,
    uint256[] memory params
) external;
```

## Events
### SetValueA

```solidity
event SetValueA(uint256 _val);
```

### SetValueB

```solidity
event SetValueB(uint256 _val);
```
