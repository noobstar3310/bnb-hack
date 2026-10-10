// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {FolioVault, TradeRequest} from "../src/FolioVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockRouter} from "./mocks/MockRouter.sol";
import {VaultFixture} from "./helpers/VaultFixture.sol";

contract FolioVaultRebalanceTest is VaultFixture {
    MockERC20 internal nvda;
    PriceUpdate internal at300;
    bytes internal at300Signature;

    function setUp() public override {
        super.setUp();
        nvda = new MockERC20("Nvidia (Ondo)", "NVDAon", 18);
        vm.prank(governance);
        registry.setAsset(address(nvda), true);
        _seedAndActivate(1_000e18);
        vm.prank(manager);
        vault.setPlan(PLAN);
        (at300, at300Signature) = _aaplPrice(300e18);
    }

    /// @dev Runs `t` with AAPL signed at $300. Makes no other external call, so it can follow
    ///      `vm.expectRevert` directly.
    function _rebalanceAt300(TradeRequest memory t) internal {
        vm.prank(manager);
        vault.rebalance(t, at300, at300Signature);
    }

    // ---- plan

    function test_setPlan_storesTextAndBumpsVersion() public {
        vm.expectEmit(address(vault));
        emit FolioVault.PlanPosted(2, "all in NVDA");
        vm.prank(manager);
        vault.setPlan("all in NVDA");

        assertEq(vault.plan(), "all in NVDA");
        assertEq(vault.planVersion(), 2);
    }

    function test_setPlan_onlyManager() public {
        vm.expectRevert(FolioVault.NotManager.selector);
        vm.prank(mallory);
        vault.setPlan("rug");
    }

    function test_setPlan_worksBeforeActivation() public {
        FolioVault fresh = new FolioVault(registry, manager, "Folio Test", "fTST");
        vm.prank(manager);
        fresh.setPlan(PLAN);
        assertEq(fresh.planVersion(), 1);
    }

    function test_setPlan_rejectsEmptyAndTooLong() public {
        vm.expectRevert(FolioVault.InvalidPlanLength.selector);
        vm.prank(manager);
        vault.setPlan("");

        vm.expectRevert(FolioVault.InvalidPlanLength.selector);
        vm.prank(manager);
        vault.setPlan(string(new bytes(1001)));
    }

    // ---- who and when

    function test_rebalance_needsAPlan() public {
        FolioVault fresh = new FolioVault(registry, manager, "Folio Test", "fTST");
        usdt.mint(bob, 100e18);
        vm.startPrank(bob);
        usdt.approve(address(fresh), 100e18);
        fresh.seed(100e18);
        vm.stopPrank();
        vm.prank(guardian);
        fresh.activate();
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);

        vm.expectRevert(FolioVault.NoPlanPosted.selector);
        vm.prank(manager);
        fresh.rebalance(_swapRequest(usdt, aapl, 300e18, 1e18), update, signature);
    }

    function test_rebalance_onlyManager() public {
        (PriceUpdate memory update, bytes memory signature) = _aaplPrice(300e18);
        vm.expectRevert(FolioVault.NotManager.selector);
        vm.prank(mallory);
        vault.rebalance(_swapRequest(usdt, aapl, 300e18, 1e18), update, signature);
    }

    function test_rebalance_blockedWhilePaused() public {
        vm.prank(guardian);
        vault.pause();

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        _rebalanceAt300(_swapRequest(usdt, aapl, 300e18, 1e18));
    }

    function test_rebalance_rejectsUnsignedPrices() public {
        address[] memory assets = new address[](1);
        assets[0] = address(aapl);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 1e18; // AAPL "worth" $1, so 1 USDT for 1 AAPL would look fair
        (PriceUpdate memory update, bytes memory signature) =
            _sign(0xBAD, assets, prices, uint64(block.timestamp));

        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        vm.prank(manager);
        vault.rebalance(_swapRequest(usdt, aapl, 300e18, 1e18), update, signature);
    }

    // ---- what can be traded

    function test_rebalance_rejectsUnknownRouter() public {
        MockRouter rogue = new MockRouter();
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.router = address(rogue);

        vm.expectRevert(FolioVault.RouterNotAllowed.selector);
        _rebalanceAt300(t);
    }

    function test_rebalance_rejectsARouterThatIsAlsoAnAsset() public {
        // Calling a token as the "router" could approve a thief without moving any balance.
        vm.prank(governance);
        registry.setRouter(address(aapl), true);
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.router = address(aapl);
        t.callData = abi.encodeCall(aapl.approve, (mallory, type(uint256).max));

        vm.expectRevert(FolioVault.RouterNotAllowed.selector);
        _rebalanceAt300(t);
    }

    function test_rebalance_rejectsBuyTokenNotAllowlisted() public {
        MockERC20 junk = new MockERC20("Junk", "JNK", 18);

        vm.expectRevert(FolioVault.AssetNotAllowed.selector);
        _rebalanceAt300(_swapRequest(usdt, junk, 300e18, 1e18));
    }

    function test_rebalance_rejectsSellingWhatIsNotHeld() public {
        vm.expectRevert(FolioVault.AssetNotHeld.selector);
        _rebalanceAt300(_swapRequest(aapl, usdt, 1e18, 300e18));
    }

    function test_rebalance_rejectsSameToken() public {
        vm.expectRevert(FolioVault.AssetNotAllowed.selector);
        _rebalanceAt300(_swapRequest(usdt, usdt, 300e18, 300e18));
    }

    // ---- the honest trade

    function test_rebalance_swapsAndRecordsIt() public {
        vm.expectEmit(address(vault));
        emit FolioVault.Rebalanced(address(usdt), address(aapl), 300e18, 1e18, 1);
        (uint256 sold, uint256 bought) = _trade(usdt, aapl, 300e18, 1e18);

        assertEq(sold, 300e18);
        assertEq(bought, 1e18);
        assertEq(usdt.balanceOf(address(vault)), 700e18);
        assertEq(aapl.balanceOf(address(vault)), 1e18);
        address[] memory held = vault.heldAssets();
        assertEq(held.length, 2);
        assertEq(held[1], address(aapl));
    }

    function test_rebalance_leavesNoAllowance() public {
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.maxSellAmount = 500e18; // allowed more than the router took

        _rebalanceAt300(t);

        assertEq(usdt.allowance(address(vault), address(router)), 0);
    }

    function test_rebalance_sellingAllOfAStockDropsIt() public {
        _buyAapl(300e18, 1e18);

        _trade(aapl, usdt, 1e18, 300e18);

        address[] memory held = vault.heldAssets();
        assertEq(held.length, 1, "a sold-out stock never needs a price again");
        assertEq(held[0], address(usdt));
    }

    function test_rebalance_usdtStaysHeldEvenAtZero() public {
        _trade(usdt, aapl, 1_000e18, 3e18);

        address[] memory held = vault.heldAssets();
        assertEq(held[0], address(usdt), "new deposits land in USDT, so it must stay counted");
        assertEq(held.length, 2);
    }

    function test_rebalance_stockToStock() public {
        _buyAapl(300e18, 1e18);

        _trade(aapl, nvda, 1e18, 2e18);

        assertEq(nvda.balanceOf(address(vault)), 2e18);
        assertEq(vault.heldAssets().length, 2, "AAPL dropped, NVDA added");
    }

    // ---- the 2% price check

    function test_rebalance_acceptsALossUpToTwoPercent() public {
        // 980 USDT of AAPL at $300 is 3.2666...; 3.27 AAPL is worth 981.
        _rebalanceAt300(_swapRequest(usdt, aapl, 1_000e18, 3.27e18));
        assertEq(aapl.balanceOf(address(vault)), 3.27e18);
    }

    function test_rebalance_rejectsALossOverTwoPercent() public {
        // 3.2 AAPL at $300 is 960 for 1,000 sold: a 4% loss.
        vm.expectRevert(abi.encodeWithSelector(FolioVault.TradeLossTooHigh.selector, 1_000e18, 960e18));
        _rebalanceAt300(_swapRequest(usdt, aapl, 1_000e18, 3.2e18));
    }

    function test_rebalance_curatorCannotGiveFundsAway() public {
        // The calldata sends the USDT to a pool the manager owns and returns 1 wei.
        TradeRequest memory t = _swapRequest(usdt, aapl, 1_000e18, 1);
        t.minBuyAmount = 0;

        vm.expectRevert(abi.encodeWithSelector(FolioVault.TradeLossTooHigh.selector, 1_000e18, 300));
        _rebalanceAt300(t);
    }

    function test_rebalance_rejectsGettingNothing() public {
        TradeRequest memory t = _swapRequest(usdt, aapl, 1_000e18, 0);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BuyTooLow.selector, 0, 0));
        _rebalanceAt300(t);
    }

    function test_rebalance_respectsTheManagersOwnMinimum() public {
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.minBuyAmount = 1.1e18;

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BuyTooLow.selector, 1e18, 1.1e18));
        _rebalanceAt300(t);
    }

    // ---- hostile routers

    function test_rebalance_routerCannotPullMoreThanMax() public {
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.maxSellAmount = 200e18;

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(router), 200e18, 300e18
            )
        );
        _rebalanceAt300(t);
    }

    function test_rebalance_routerCannotTakeAnotherHolding() public {
        _buyAapl(300e18, 1e18);
        TradeRequest memory t = _swapRequest(usdt, nvda, 100e18, 1e18);
        t.callData = abi.encodeCall(MockRouter.swapAndTake, (usdt, nvda, 100e18, 1e18, aapl, 0.5e18));
        (PriceUpdate memory update, bytes memory signature) = _fairPrices(usdt, nvda, 100e18, 1e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.CollateralDecreased.selector, address(aapl)));
        vm.prank(manager);
        vault.rebalance(t, update, signature);
    }

    function test_rebalance_routerCannotReenter() public {
        TradeRequest memory t = _swapRequest(usdt, aapl, 300e18, 1e18);
        t.callData = abi.encodeCall(MockRouter.reenterRedeem, (vault));

        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        _rebalanceAt300(t);
    }

    // ---- asset cap

    /// @dev Fills the vault to MAX_ASSETS: USDT plus 9 stocks.
    function _fillToCap() internal returns (MockERC20[] memory stocks) {
        stocks = new MockERC20[](vault.MAX_ASSETS() - 1);
        for (uint256 i; i < stocks.length; ++i) {
            stocks[i] = new MockERC20("Stock", "STK", 18);
            vm.prank(governance);
            registry.setAsset(address(stocks[i]), true);
            _trade(usdt, stocks[i], 10e18, 1e18);
        }
    }

    function test_rebalance_capsHeldAssets() public {
        _fillToCap();
        MockERC20 extra = new MockERC20("Extra", "XTR", 18);
        vm.prank(governance);
        registry.setAsset(address(extra), true);
        (PriceUpdate memory update, bytes memory signature) = _fairPrices(usdt, extra, 10e18, 1e18);

        vm.expectRevert(FolioVault.TooManyAssets.selector);
        vm.prank(manager);
        vault.rebalance(_swapRequest(usdt, extra, 10e18, 1e18), update, signature);
    }

    function test_rebalance_atCapCanSwapOneStockFullyForANewOne() public {
        MockERC20[] memory stocks = _fillToCap();
        MockERC20 extra = new MockERC20("Extra", "XTR", 18);
        vm.prank(governance);
        registry.setAsset(address(extra), true);

        _trade(stocks[0], extra, 1e18, 1e18);

        assertEq(vault.heldAssets().length, vault.MAX_ASSETS());
    }
}
