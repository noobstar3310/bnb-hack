// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";
import {FolioVault} from "../../src/FolioVault.sol";

/// @dev FolioVault plus two test-only hooks that stand in for a manager trade until SC-04
///      builds `rebalance`. Never deployed outside tests.
contract FolioVaultHarness is FolioVault {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    constructor(AssetRegistry registry_, address manager_)
        FolioVault(registry_, manager_, "Folio Test", "fTST")
    {}

    /// @dev The buy side of a trade: the vault now counts `asset` as a holding.
    function addHeldAsset(address asset) external {
        _held.add(asset);
    }

    /// @dev The sell side of a trade: tokens leave the vault.
    function sendOut(IERC20 token, address to, uint256 amount) external {
        token.safeTransfer(to, amount);
    }
}
