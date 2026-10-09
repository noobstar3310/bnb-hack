// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssetRegistry} from "./AssetRegistry.sol";
import {FolioVault} from "./FolioVault.sol";

/// @notice Deploys vaults and keeps the list of genuine ones. Holds no funds.
///         Creation is open to anyone: a new vault is a `DRAFT`. The seed is the
///         only deposit it accepts until the guardian activates it.
contract VaultFactory {
    AssetRegistry public immutable registry;

    address[] public vaults;
    mapping(address vault => bool created) public isVault;

    event VaultCreated(address indexed vault, address indexed manager, address settlement);

    constructor(AssetRegistry registry_) {
        registry = registry_;
    }

    function createVault(string calldata name, string calldata symbol, address manager)
        external
        returns (address vault)
    {
        vault = address(new FolioVault(registry, manager, name, symbol));
        isVault[vault] = true;
        vaults.push(vault);
        emit VaultCreated(vault, manager, registry.settlementToken());
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }
}
