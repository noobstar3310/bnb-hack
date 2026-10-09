// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry, PriceUpdate} from "../../src/AssetRegistry.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {FolioVaultHarness} from "./FolioVaultHarness.sol";

/// @dev Shared setup for deposit and redeem tests: a registry with a price signer, an allowed
///      stock token, and a harness vault.
abstract contract VaultFixture is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant DEAD_SHARES = 1e15;
    uint256 internal constant SIGNER_KEY = 0xA11CE;

    address internal priceSigner = vm.addr(SIGNER_KEY);
    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal manager = makeAddr("manager");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal mallory = makeAddr("mallory");
    address internal sink = makeAddr("sink");

    MockERC20 internal usdt;
    MockERC20 internal aapl;
    AssetRegistry internal registry;
    FolioVaultHarness internal vault;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        usdt = new MockERC20("Tether USD", "USDT", 18);
        aapl = new MockERC20("Apple (Ondo)", "AAPLon", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        vm.startPrank(governance);
        registry.setAsset(address(aapl), true);
        registry.setPriceSigner(priceSigner);
        vm.stopPrank();
        vault = new FolioVaultHarness(registry, manager);
    }

    /// @dev Bob seeds `amount` USDT, then the guardian activates.
    function _seedAndActivate(uint256 amount) internal {
        usdt.mint(bob, amount);
        vm.prank(bob);
        usdt.approve(address(vault), amount);
        vm.prank(bob);
        vault.seed(amount);
        vm.prank(guardian);
        vault.activate();
    }

    /// @dev Stand-in for a manager trade (SC-04): `usdtOut` leaves, `aaplIn` arrives.
    function _simulateBuy(uint256 usdtOut, uint256 aaplIn) internal {
        vault.sendOut(usdt, sink, usdtOut);
        aapl.mint(address(vault), aaplIn);
        vault.addHeldAsset(address(aapl));
    }

    /// @dev A fresh AAPL price signed by the price signer.
    function _aaplPrice(uint256 price)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        address[] memory assets = new address[](1);
        assets[0] = address(aapl);
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        return _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
    }

    function _sign(uint256 key, address[] memory assets, uint256[] memory prices, uint64 timestamp)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        update = PriceUpdate({assets: assets, prices: prices, timestamp: timestamp});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        signature = abi.encodePacked(r, s, v);
    }

    /// @dev `who` deposits `amount` USDT with no minimum-shares bound.
    function _deposit(address who, uint256 amount, PriceUpdate memory update, bytes memory signature)
        internal
        returns (uint256 shares)
    {
        usdt.mint(who, amount);
        vm.prank(who);
        usdt.approve(address(vault), amount);
        vm.prank(who);
        shares = vault.deposit(amount, update, signature, 0);
    }
}
