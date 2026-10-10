// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    Deploy internal script;
    address internal deployer = makeAddr("deployer");

    function setUp() public {
        script = new Deploy();
    }

    function test_deploy_configuresEverythingInOneGo() public {
        (AssetRegistry registry, VaultFactory factory) = script.deploy(deployer);

        assertEq(registry.owner(), deployer, "no timelock for the hackathon: the deployer owns the rules");
        assertEq(registry.guardian(), deployer, "the deployer also activates and pauses vaults");
        assertEq(registry.settlementToken(), script.USDT());
        assertEq(registry.priceSigner(), script.PRICE_SIGNER());
        assertTrue(registry.isRouter(script.BINANCE_ROUTER()));
        assertTrue(registry.isAsset(script.AAPL_ON()));
        assertTrue(registry.isAsset(script.NVDA_ON()));
        assertTrue(registry.isAsset(script.MSFT_ON()));
        assertFalse(registry.isAsset(script.BINANCE_ROUTER()), "a router must never also be an asset");
        assertEq(address(factory.registry()), address(registry));
    }

    function test_deploy_refusesFoundrysDefaultSender() public {
        // Forgetting --account would hand the registry to a well-known address nobody controls.
        vm.expectRevert(Deploy.NoDeployerAccount.selector);
        script.deploy(0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38);
    }
}
