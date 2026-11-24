# StakingHbbftMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/StakingHbbftMock.sol)

**Inherits:**
[StakingHbbft](../../StakingHbbft.sol/contract.StakingHbbft.md)


## State Variables
### validatorSetContractMock

```solidity
IValidatorSetHbbft private validatorSetContractMock
```


## Functions
### onlyValidatorSetContract


```solidity
modifier onlyValidatorSetContract() virtual override;
```

### addBalance


```solidity
function addBalance() public payable;
```

### addPoolActiveMock


```solidity
function addPoolActiveMock(address _stakingAddress) public;
```

### addPoolInactiveMock


```solidity
function addPoolInactiveMock(address _stakingAddress) public;
```

### clearDelegatorStakeSnapshot


```solidity
function clearDelegatorStakeSnapshot(address pool, address delegator, uint256 epoch) external;
```

### setStakeAmountTotal


```solidity
function setStakeAmountTotal(address _poolStakingAddress, uint256 _amount) public;
```

### setTotalStakedAmount


```solidity
function setTotalStakedAmount(uint256 _amount) public;
```

### setStakingEpoch


```solidity
function setStakingEpoch(uint256 _stakingEpoch) public;
```

### setValidatorMockSetAddress


```solidity
function setValidatorMockSetAddress(IValidatorSetHbbft _validatorSetAddress) public;
```

### setValidatorSetAddress


```solidity
function setValidatorSetAddress(IValidatorSetHbbft _validatorSetAddress) public;
```

### setBonusScoreContract


```solidity
function setBonusScoreContract(address _bonusScoreContract) public;
```

### setNodeOperatorMock


```solidity
function setNodeOperatorMock(
    address poolStakingAddress,
    address operator,
    uint256 share
) public;
```

### getMaxCandidates


```solidity
function getMaxCandidates() external pure returns (uint256);
```

### getDelegatorStakeSnapshot


```solidity
function getDelegatorStakeSnapshot(
    address pool,
    address delegator,
    uint256 epoch
) external view returns (uint256);
```

### getStakeSnapshotLastEpoch


```solidity
function getStakeSnapshotLastEpoch(
    address pool,
    address delegator
) external view returns (uint256);
```

### _getMaxCandidates


```solidity
function _getMaxCandidates() internal pure virtual override returns (uint256);
```
