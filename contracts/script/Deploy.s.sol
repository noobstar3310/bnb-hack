// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";

/// @notice Deploys Folio Lab to BSC mainnet and configures it in the same run.
///
///         HACKATHON SETUP, NO TIMELOCK: the deployer stays the registry owner (governance) and is
///         also the guardian. The spec's 24h timelock would block every allowlist change until
///         after the deadline. Hand ownership to a timelock before real money is involved.
///
///         forge script script/Deploy.s.sol --rpc-url bsc --account defaultKey --broadcast --verify
contract Deploy is Script {
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    /// @dev Backend key that signs deposit and trade prices (Part 2).
    address public constant PRICE_SIGNER = 0x4508009eb773376e3468E19aaa0AC6046e8c2dE4;
    /// @dev Binance Web3 swap router: both `tx.to` and `approveTarget` of a live swap (10 Oct).
    address public constant BINANCE_ROUTER = 0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5;
    address public constant AAPL_ON = 0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4;
    address public constant NVDA_ON = 0xA9eE28C80f960B889dFbd1902055218cBa016F75;
    address public constant MSFT_ON = 0x6Bfe75D1ad432050eA973C3A3DcD88F02e2444C3;

    error NoDeployerAccount();

    function run() external returns (AssetRegistry registry, VaultFactory factory) {
        return deploy(msg.sender);
    }

    /// @param deployer Becomes owner and guardian. Every setup call is sent from it.
    function deploy(address deployer) public returns (AssetRegistry registry, VaultFactory factory) {
        if (deployer == DEFAULT_SENDER) revert NoDeployerAccount();

        vm.startBroadcast(deployer);
        registry = new AssetRegistry(deployer, deployer, USDT);
        registry.setPriceSigner(PRICE_SIGNER);
        registry.setRouter(BINANCE_ROUTER, true);
        registry.setAsset(AAPL_ON, true);
        registry.setAsset(NVDA_ON, true);
        registry.setAsset(MSFT_ON, true);
        factory = new VaultFactory(registry);
        vm.stopBroadcast();

        console.log("chainId  ", block.chainid);
        console.log("REGISTRY ", address(registry));
        console.log("FACTORY  ", address(factory));
        console.log("OWNER and GUARDIAN", deployer);
    }
}
