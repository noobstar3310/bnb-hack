// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {MockERC20, MockFeeERC20} from "./mocks/MockERC20.sol";
import {VaultFixture} from "./helpers/VaultFixture.sol";

contract FolioVaultDepositTest is VaultFixture {
    function setUp() public override {
        super.setUp();
        _seedAndActivate(1_000e18);
    }

    // ---- pricing

    function test_deposit_stockValueRoundsUp() public {
        // 1e18 + 1 AAPL at 333.333...e18 is 333.333...e18 + 333.33..., which does not divide evenly.
        _buyAapl(400e18, 1e18 + 1);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(333_333_333_333_333_333_333);
        uint256 expectedValue = 600e18 + 333_333_333_333_333_333_333 + 334; // rounded up, not 333
        uint256 expectedShares = 100e18 * 1_000e18 / expectedValue;
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectEmit(address(vault));
        emit FolioVault.Deposited(carol, 100e18, expectedShares, expectedValue, uint64(block.timestamp));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_soldOutStockNeedsNoPrice() public {
        _buyAapl(300e18, 1e18);
        _trade(aapl, usdt, 1e18, 300e18); // sold out again, so the backend signs no AAPL price
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, new address[](0), new uint256[](0), uint64(block.timestamp));

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18);
    }

    function test_deposit_cashOnlyVault_mintsOneSharePerUnit() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(200e18);

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18);
        assertEq(vault.balanceOf(carol), 100e18);
        assertEq(vault.totalSupply(), 1_100e18);
    }

    function test_deposit_afterStocksRise_mintsAtFairPrice() public {
        // Vault: 600 USDT + 2 AAPL. At $300 that is 600 + 600 = 1,200 for 1,000 shares = $1.20.
        _buyAapl(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        uint256 shares = _deposit(carol, 120e18, update, signature);

        assertEq(shares, 100e18, "120 / 1.20 = 100 shares");
        // After: 720 USDT + 2 AAPL = 1,320 for 1,100 shares = still $1.20.
        assertEq(usdt.balanceOf(address(vault)), 720e18);
        assertEq(vault.totalSupply(), 1_100e18);
    }

    function test_deposit_usdtStaysIdleInVault() public {
        _buyAapl(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        _deposit(carol, 120e18, update, signature);

        assertEq(usdt.balanceOf(address(vault)), 720e18, "deposit sits as idle USDT");
        assertEq(aapl.balanceOf(address(vault)), 2e18, "no stock was bought");
        assertEq(vault.heldAssets().length, 2, "no new holding");
    }

    function test_deposit_emitsDeposited() public {
        _buyAapl(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 120e18);
        vm.prank(carol);
        usdt.approve(address(vault), 120e18);

        vm.expectEmit(address(vault));
        emit FolioVault.Deposited(carol, 120e18, 100e18, 1_200e18, uint64(block.timestamp));
        vm.prank(carol);
        vault.deposit(120e18, update, signature, 0);
    }

    function test_deposit_ignoresPricesForAssetsNotHeld() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(1);

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18, "AAPL is not held, so its price is irrelevant");
    }

    function test_deposit_settlementTokenIsAlwaysAtPar() public {
        address[] memory assets = new address[](1);
        assets[0] = address(usdt);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 2e18;
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));

        uint256 shares = _deposit(carol, 100e18, update, signature);

        assertEq(shares, 100e18, "a signed USDT price is ignored");
    }

    function test_deposit_stockWithSixDecimals() public {
        MockERC20 nvda = new MockERC20("Nvidia (Ondo)", "NVDAon", 6);
        vm.prank(governance);
        registry.setAsset(address(nvda), true);
        _trade(usdt, nvda, 400e18, 2e6);

        address[] memory assets = new address[](1);
        assets[0] = address(nvda);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 300e18;
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));

        uint256 shares = _deposit(carol, 120e18, update, signature);

        assertEq(shares, 100e18, "2 NVDA at $300 valued from its own decimals");
    }

    function test_deposit_feeOnTransfer_mintsFromReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        vm.prank(governance);
        r.setPriceSigner(priceSigner);
        FolioVault v = new FolioVault(r, manager, "Folio Test", "fTST");

        fee.mint(bob, 1_000e18);
        vm.prank(bob);
        fee.approve(address(v), 1_000e18);
        vm.prank(bob);
        v.seed(1_000e18); // 990 arrives -> 990 shares
        vm.prank(guardian);
        v.activate();

        address[] memory assets = new address[](0);
        uint256[] memory prices = new uint256[](0);
        PriceUpdate memory update =
            PriceUpdate({assets: assets, prices: prices, timestamp: uint64(block.timestamp)});
        (uint8 sv, bytes32 sr, bytes32 ss) = vm.sign(SIGNER_KEY, r.hashPriceUpdate(update));

        fee.mint(carol, 100e18);
        vm.prank(carol);
        fee.approve(address(v), 100e18);
        vm.prank(carol);
        uint256 shares = v.deposit(100e18, update, abi.encodePacked(sr, ss, sv), 0);

        assertEq(shares, 99e18, "shares follow the 99 that arrived");
    }

    function testFuzz_deposit_neverLowersValuePerShare(uint256 price, uint256 amount) public {
        _buyAapl(400e18, 2e18);
        price = bound(price, 1e15, 1e24);
        amount = bound(amount, 1e18, 1e30);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(price);
        uint256 valueBefore = 600e18 + 2 * price;
        uint256 supplyBefore = vault.totalSupply();

        uint256 shares = _deposit(carol, amount, update, signature);

        // valueAfter / supplyAfter >= valueBefore / supplyBefore, cross-multiplied.
        assertGe((valueBefore + amount) * supplyBefore, valueBefore * (supplyBefore + shares));
    }

    function testFuzz_depositThenRedeem_neverProfits(uint256 price, uint256 amount) public {
        _buyAapl(400e18, 2e18);
        price = bound(price, 1e15, 1e24);
        amount = bound(amount, 1e18, 1e30);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(price);

        uint256 shares = _deposit(carol, amount, update, signature);
        vm.prank(carol);
        (, uint256[] memory amounts) = vault.redeem(shares, carol);

        // amounts[0] is USDT, amounts[1] is AAPL, valued at the same signed price.
        assertLe(amounts[0] + amounts[1] * price / 1e18, amount);
    }

    // ---- rejections

    function test_deposit_revertsWhenHeldStockHasNoPrice() public {
        _buyAapl(400e18, 2e18);
        address[] memory assets = new address[](0);
        uint256[] memory prices = new uint256[](0);
        (PriceUpdate memory update, bytes memory signature) =
            _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.MissingPrice.selector, address(aapl)));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnZeroPrice() public {
        _buyAapl(400e18, 2e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(0);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.ZeroPrice.selector, address(aapl)));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnStalePrices() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        vm.warp(block.timestamp + 61);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.StalePrices.selector, update.timestamp));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsOnPricesSignedByAnyoneElse() public {
        _buyAapl(400e18, 2e18);
        address[] memory assets = new address[](1);
        assets[0] = address(aapl);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 1e18; // Mallory claims AAPL is worth $1
        (PriceUpdate memory update, bytes memory signature) =
            _sign(0xBAD, assets, prices, uint64(block.timestamp));
        usdt.mint(mallory, 100e18);
        vm.prank(mallory);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        vm.prank(mallory);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_deposit_revertsBelowMinShares() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.SlippageTooHigh.selector, 100e18, 101e18));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 101e18);
    }

    function test_deposit_revertsWhenNothingArrives() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        vm.expectRevert(FolioVault.ZeroShares.selector);
        vm.prank(carol);
        vault.deposit(0, update, signature, 0);
    }

    function test_deposit_revertsWhenSeededButNotActive() public {
        FolioVault fresh = new FolioVault(registry, manager, "Folio Test", "fTST");
        usdt.mint(bob, 100e18);
        vm.prank(bob);
        usdt.approve(address(fresh), 100e18);
        vm.prank(bob);
        fresh.seed(100e18);
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(carol);
        fresh.deposit(100e18, update, signature, 0);
    }

    // ---- pause

    function test_pause_guardianPausesAndUnpauses() public {
        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.ACTIVE, FolioVault.VaultState.PAUSED);
        vm.prank(guardian);
        vault.pause();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.PAUSED));

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.PAUSED, FolioVault.VaultState.ACTIVE);
        vm.prank(guardian);
        vault.unpause();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }

    function test_pause_blocksDeposits() public {
        vm.prank(guardian);
        vault.pause();
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(carol);
        vault.deposit(100e18, update, signature, 0);
    }

    function test_pause_revertsForManager() public {
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.pause();
    }

    function test_pause_revertsWhenAlreadyPaused() public {
        vm.prank(guardian);
        vault.pause();
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(guardian);
        vault.pause();
    }

    function test_unpause_revertsForManager() public {
        vm.prank(guardian);
        vault.pause();
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.unpause();
    }

    function test_unpause_revertsWhenNotPaused() public {
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.ACTIVE));
        vm.prank(guardian);
        vault.unpause();
    }
}
