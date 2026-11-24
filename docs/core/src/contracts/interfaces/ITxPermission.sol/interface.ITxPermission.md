# ITxPermission
[Git Source](https://github.com/DMDcoin/contracts-monorepo/blob/master/core/contracts/interfaces/ITxPermission.sol)


## Functions
### allowedTxTypes


```solidity
function allowedTxTypes(
    address _sender,
    address _to,
    uint256,
    /*_value */
    uint256 _gasPrice,
    bytes memory _data
) external view returns (uint32 typesMask, bool cache);
```
