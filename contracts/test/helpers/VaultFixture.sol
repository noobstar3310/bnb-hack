// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AssetRegistry, PriceUpdate} from "../../src/AssetRegistry.sol";
import {FolioVault, TradeRequest} from "../../src/FolioVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockRouter} from "../mocks/MockRouter.sol";

/// @dev Shared setup for vault tests: a registry with a price signer, an allowed stock token, an
///      allowed mock router, and a vault.
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
    string internal constant PLAN = "30% AAPL, rest in cash";

    MockERC20 internal usdt;
    MockERC20 internal aapl;
    AssetRegistry internal registry;
    MockRouter internal router;
    FolioVault internal vault;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        usdt = new MockERC20("Tether USD", "USDT", 18);
        aapl = new MockERC20("Apple (Ondo)", "AAPLon", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        vm.startPrank(governance);
        registry.setAsset(address(aapl), true);
        registry.setPriceSigner(priceSigner);
        router = new MockRouter();
        registry.setRouter(address(router), true);
        vm.stopPrank();
        vault = new FolioVault(registry, manager, "Folio Test", "fTST");
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

    /// @dev The manager buys `aaplIn` AAPL for `usdtOut` USDT through the mock router.
    function _buyAapl(uint256 usdtOut, uint256 aaplIn) internal {
        _trade(usdt, aapl, usdtOut, aaplIn);
    }

    /// @dev The manager posts a plan if none exists yet, then swaps `sellAmount` of `sell` for
    ///      exactly `buyAmount` of `buy`, with prices signed so the trade is exactly fair.
    function _trade(MockERC20 sell, MockERC20 buy, uint256 sellAmount, uint256 buyAmount)
        internal
        returns (uint256 sold, uint256 bought)
    {
        if (vault.planVersion() == 0) {
            vm.prank(manager);
            vault.setPlan(PLAN);
        }
        (PriceUpdate memory update, bytes memory signature) = _fairPrices(sell, buy, sellAmount, buyAmount);
        vm.prank(manager);
        return vault.rebalance(_swapRequest(sell, buy, sellAmount, buyAmount), update, signature);
    }

    /// @dev An honest router call: pull exactly `sellAmount`, deliver exactly `buyAmount` to the vault.
    function _swapRequest(MockERC20 sell, MockERC20 buy, uint256 sellAmount, uint256 buyAmount)
        internal
        view
        returns (TradeRequest memory)
    {
        return TradeRequest({
            router: address(router),
            sellToken: address(sell),
            buyToken: address(buy),
            maxSellAmount: sellAmount,
            minBuyAmount: buyAmount,
            callData: abi.encodeCall(MockRouter.swap, (sell, buy, sellAmount, buyAmount, address(vault)))
        });
    }

    /// @dev Signed prices under which `sellAmount` of `sell` is worth exactly `buyAmount` of `buy`
    ///      (rounded so the trade never looks like a loss).
    function _fairPrices(MockERC20 sell, MockERC20 buy, uint256 sellAmount, uint256 buyAmount)
        internal
        view
        returns (PriceUpdate memory, bytes memory)
    {
        uint256 sellUnit = 10 ** IERC20Metadata(address(sell)).decimals();
        uint256 buyUnit = 10 ** IERC20Metadata(address(buy)).decimals();
        if (sell == usdt) {
            return _price(buy, Math.mulDiv(sellAmount, buyUnit, buyAmount, Math.Rounding.Ceil));
        }
        if (buy == usdt) return _price(sell, Math.mulDiv(buyAmount, sellUnit, sellAmount));
        uint256 sellPrice = 100e18;
        uint256 sellValue = Math.mulDiv(sellAmount, sellPrice, sellUnit, Math.Rounding.Ceil);
        address[] memory assets = new address[](2);
        assets[0] = address(sell);
        assets[1] = address(buy);
        uint256[] memory prices = new uint256[](2);
        prices[0] = sellPrice;
        prices[1] = Math.mulDiv(sellValue, buyUnit, buyAmount, Math.Rounding.Ceil);
        return _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
    }

    /// @dev A fresh signed price for one token.
    function _price(MockERC20 token, uint256 price) internal view returns (PriceUpdate memory, bytes memory) {
        address[] memory assets = new address[](1);
        assets[0] = address(token);
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        return _sign(SIGNER_KEY, assets, prices, uint64(block.timestamp));
    }

    /// @dev A fresh AAPL price signed by the price signer.
    function _aaplPrice(uint256 price)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        return _price(aapl, price);
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
