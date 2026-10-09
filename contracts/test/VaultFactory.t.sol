// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract VaultFactoryTest is Test {
    AssetRegistry internal registry;
    VaultFactory internal factory;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal curator = makeAddr("curator");
    address internal investor = makeAddr("investor");

    function setUp() public {
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        factory = new VaultFactory(registry);
    }

    function test_constructor_setsRegistry() public view {
        assertEq(address(factory.registry()), address(registry));
        assertEq(factory.vaultCount(), 0);
    }

    function test_createVault_deploysConfiguredVault() public {
        vm.prank(curator);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));

        assertEq(vault.name(), "Folio Tech");
        assertEq(vault.symbol(), "fTECH");
        assertEq(vault.manager(), curator);
        assertEq(address(vault.registry()), address(registry));
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.DRAFT));
    }

    function test_createVault_recordsVault() public {
        address vault = factory.createVault("Folio Tech", "fTECH", curator);

        assertTrue(factory.isVault(vault));
        assertEq(factory.vaultCount(), 1);
        assertEq(factory.vaults(0), vault);
    }

    function test_createVault_emitsVaultCreated() public {
        address expected = vm.computeCreateAddress(address(factory), vm.getNonce(address(factory)));

        vm.expectEmit(address(factory));
        emit VaultFactory.VaultCreated(expected, curator, address(usdt));
        address vault = factory.createVault("Folio Tech", "fTECH", curator);

        assertEq(vault, expected);
    }

    function test_createVault_managerCanDifferFromCaller() public {
        vm.prank(investor);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));
        assertEq(vault.manager(), curator);
    }

    function test_createVault_eachCallMakesADistinctVault() public {
        address a = factory.createVault("Folio Tech", "fTECH", curator);
        address b = factory.createVault("Folio Tech", "fTECH", curator);

        assertTrue(a != b);
        assertEq(factory.vaultCount(), 2);
        assertEq(factory.vaults(1), b);
    }

    function test_createVault_revertsOnZeroManager() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        factory.createVault("Folio Tech", "fTECH", address(0));
    }

    function test_isVault_falseForUnknownAddress() public view {
        assertFalse(factory.isVault(address(this)));
    }

    function test_endToEnd_createSeedActivate() public {
        vm.prank(curator);
        FolioVault vault = FolioVault(factory.createVault("Folio Tech", "fTECH", curator));

        usdt.mint(investor, 500e18);
        vm.prank(investor);
        usdt.approve(address(vault), 500e18);
        vm.prank(investor);
        vault.seed(500e18);

        vm.prank(guardian);
        vault.activate();

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
        assertEq(vault.totalSupply(), 500e18);
        assertEq(vault.balanceOf(investor), 500e18 - 1e15);
        assertEq(usdt.balanceOf(address(vault)), 500e18);
    }
}
