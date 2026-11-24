# ValidatorSetHbbftMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/ValidatorSetHbbftMock.sol)

**Inherits:**
[ValidatorSetHbbft](../../ValidatorSetHbbft.sol/contract.ValidatorSetHbbft.md)


## Functions
### receive


```solidity
receive() external payable;
```

### setBlockRewardContract


```solidity
function setBlockRewardContract(address _address) public;
```

### setRandomContract


```solidity
function setRandomContract(address _address) public;
```

### setStakingContract


```solidity
function setStakingContract(address _address) public;
```

### setKeyGenHistoryContract


```solidity
function setKeyGenHistoryContract(address _address) public;
```

### setBonusScoreSystemAddress


```solidity
function setBonusScoreSystemAddress(address _address) public;
```

### setConnectivityTracker


```solidity
function setConnectivityTracker(address _address) public;
```

### setValidatorAvailableSince


```solidity
function setValidatorAvailableSince(address _validator, uint256 _timestamp) public;
```

### forceFinalizeNewValidators


```solidity
function forceFinalizeNewValidators() external;
```

### setValidatorsNum


```solidity
function setValidatorsNum(uint256 num) external;
```

### kickValidator


```solidity
function kickValidator(address _mining) external;
```

### addPendingValidator


```solidity
function addPendingValidator(address _mining) external;
```

### getRandomIndex


```solidity
function getRandomIndex(
    uint256[] memory _likelihood,
    uint256 _likelihoodSum,
    uint256 _randomNumber
) public pure returns (uint256);
```
