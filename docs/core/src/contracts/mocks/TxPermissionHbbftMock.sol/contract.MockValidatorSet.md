# MockValidatorSet
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/TxPermissionHbbftMock.sol)


## State Variables
### keyGenMode

```solidity
IValidatorSetHbbft.KeyGenMode public keyGenMode
```


### stakingContract

```solidity
address public stakingContract
```


### isValidator

```solidity
mapping(address => bool) public isValidator
```


## Functions
### setValidator


```solidity
function setValidator(address mining, bool val) external;
```

### setKeyGenMode


```solidity
function setKeyGenMode(IValidatorSetHbbft.KeyGenMode _mode) external;
```

### setStakingContract


```solidity
function setStakingContract(address _address) external;
```

### getPendingValidatorKeyGenerationMode


```solidity
function getPendingValidatorKeyGenerationMode(address)
    external
    view
    returns (IValidatorSetHbbft.KeyGenMode);
```

### getStakingContract


```solidity
function getStakingContract() external view returns (address);
```
