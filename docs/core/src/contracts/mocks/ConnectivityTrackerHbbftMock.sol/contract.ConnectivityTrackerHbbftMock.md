# ConnectivityTrackerHbbftMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/ConnectivityTrackerHbbftMock.sol)


## State Variables
### earlyEpochEnd

```solidity
mapping(uint256 => bool) public earlyEpochEnd
```


### epochPenaltiesSent

```solidity
mapping(uint256 => bool) public epochPenaltiesSent
```


## Functions
### receive


```solidity
receive() external payable;
```

### setEarlyEpochEnd


```solidity
function setEarlyEpochEnd(uint256 epoch, bool set) external;
```

### penaliseFaultyValidators


```solidity
function penaliseFaultyValidators(uint256 epoch) external;
```

### isEarlyEpochEnd


```solidity
function isEarlyEpochEnd(uint256 epoch) external view returns (bool);
```

### isEpochPenaltiesSent


```solidity
function isEpochPenaltiesSent(uint256 epoch) external view returns (bool);
```
