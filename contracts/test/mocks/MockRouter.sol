// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FolioVault} from "../../src/FolioVault.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Stands in for the Binance router. `swap` behaves like an honest trade; the other functions
///      are the hostile calldata a bad manager could send instead.
contract MockRouter {
    using SafeERC20 for IERC20;

    /// @dev Takes `pull` of `sell` from the caller and pays `give` of `buy` to `to`.
    function swap(IERC20 sell, MockERC20 buy, uint256 pull, uint256 give, address to) public {
        sell.safeTransferFrom(msg.sender, address(this), pull);
        buy.mint(to, give);
    }

    /// @dev A fair-looking swap that also takes `amount` of another token the vault holds.
    function swapAndTake(
        IERC20 sell,
        MockERC20 buy,
        uint256 pull,
        uint256 give,
        MockERC20 victim,
        uint256 amount
    ) external {
        swap(sell, buy, pull, give, msg.sender);
        victim.burn(msg.sender, amount);
    }

    /// @dev Calls back into the vault mid-trade.
    function reenterRedeem(FolioVault vault) external {
        vault.redeem(1, address(this));
    }
}
