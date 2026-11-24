# EtherReceiverMock
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/mocks/EtherReceiverMock.sol)


## State Variables
### allowReceive

```solidity
bool public allowReceive
```


## Functions
### constructor


```solidity
constructor() ;
```

### receive


```solidity
receive() external payable;
```

### toggleReceive


```solidity
function toggleReceive(bool allow) external;
```

## Errors
### ReceiveDisabled

```solidity
error ReceiveDisabled();
```
