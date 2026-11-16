// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.25;

import {IDiamondDao} from "../interfaces/IDiamondDao.sol";
import {OpenProposalMajority} from "../library/DaoStructs.sol";

contract MockProposer {
    IDiamondDao public dao;
    bool public allowReceive;
    bool public consumeGas;

    error ReceiveDisabled();

    constructor(address _dao) {
        dao = IDiamondDao(_dao);
        allowReceive = true;
    }

    receive() external payable {
        if (!allowReceive) {
            revert ReceiveDisabled();
        }

        if (consumeGas) {
            while (true) {}
        }
    }

    function toggleReceive(bool allow) external {
        allowReceive = allow;
    }

    function toggleConsumeGas(bool consume) external {
        consumeGas = consume;
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory title,
        string memory description,
        string memory discussionUrl,
        OpenProposalMajority majority
    ) external payable {
        dao.propose{value: msg.value}(
            targets, values, calldatas, title, description, discussionUrl, majority
        );
    }

    function claimProposalFee() external {
        dao.claimProposalFee();
    }
}
