// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {AssetRegistry, PriceUpdate} from "./AssetRegistry.sol";

/// @notice One manager trade: swap up to `maxSellAmount` of `sellToken` for at least `minBuyAmount`
///         of `buyToken` by calling `router` with `callData` (built by the Binance trading API).
struct TradeRequest {
    address router;
    address sellToken;
    address buyToken;
    uint256 maxSellAmount;
    uint256 minBuyAmount;
    bytes callData;
}

/// @notice A pooled portfolio. Holds the assets and is itself the ERC-20 share token.
///         Deposits are priced from backend-signed stock prices (spec §1, §8.0); redemption is
///         proportional and needs no price.
contract FolioVault is ERC20, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    enum VaultState {
        DRAFT,
        SEEDED,
        ACTIVE,
        PAUSED,
        CLOSED
    }

    /// @notice Shares locked forever at seed so `totalSupply` can never return to zero.
    uint256 public constant DEAD_SHARES = 1e15;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Most tokens a vault may hold, USDT included. Every deposit and redeem loops over them.
    uint256 public constant MAX_ASSETS = 10;
    /// @notice Most a trade may lose against the signed prices, in basis points (2%).
    uint256 public constant MAX_TRADE_LOSS_BPS = 200;
    uint256 public constant MAX_PLAN_LENGTH = 1000;
    /// @notice A stock left with at most 1/DUST_DIVISOR of one token after a sell counts as sold
    ///         out, so a 1-wei donation cannot keep it in the held list.
    uint256 public constant DUST_DIVISOR = 1e6;

    uint256 internal constant MIN_SEED_UNITS = 10;

    AssetRegistry public immutable registry;
    IERC20 public immutable settlementToken;
    /// @notice One whole settlement token, in its own smallest units.
    uint256 public immutable settlementUnit;
    uint256 public immutable minSeed;

    address public manager;
    VaultState public state;

    /// @notice The manager's investment plan, free text. Informational only: trades never check it,
    ///         but none can happen before the first plan is posted.
    string public plan;
    /// @notice Bumped by every `setPlan`; 0 means no plan yet.
    uint64 public planVersion;

    EnumerableSet.AddressSet internal _held;

    event Seeded(address indexed investor, uint256 amount, uint256 shares);
    event StateChanged(VaultState from, VaultState to);
    event Deposited(
        address indexed investor, uint256 amount, uint256 shares, uint256 vaultValue, uint64 priceTimestamp
    );
    event Redeemed(address indexed investor, uint256 shares, address[] assets, uint256[] amounts);
    event PlanPosted(uint64 indexed version, string plan);
    event Rebalanced(
        address indexed sellToken, address indexed buyToken, uint256 sold, uint256 bought, uint64 planVersion
    );

    error ZeroAddress();
    error UnsupportedDecimals(uint8 decimals);
    error NotGuardian();
    error WrongState(VaultState current);
    error BelowMinimumSeed(uint256 received, uint256 minimum);
    error TransfersDisabled();
    error MissingPrice(address asset);
    error ZeroPrice(address asset);
    error EmptyVault();
    error ZeroShares();
    error SlippageTooHigh(uint256 shares, uint256 minShares);
    error NothingToRedeem();
    error DeadSharesLocked();
    error NotManager();
    error InvalidPlanLength();
    error NoPlanPosted();
    error RouterNotAllowed();
    error AssetNotAllowed();
    error AssetNotHeld();
    error SellExceeded(uint256 sold, uint256 maxSell);
    error BuyTooLow(uint256 bought, uint256 minBuy);
    error TradeLossTooHigh(uint256 valueSold, uint256 valueBought);
    error CollateralDecreased(address asset);
    error TooManyAssets();

    constructor(AssetRegistry registry_, address manager_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        if (manager_ == address(0)) revert ZeroAddress();
        address token = registry_.settlementToken();
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        if (tokenDecimals > 18) revert UnsupportedDecimals(tokenDecimals);

        registry = registry_;
        manager = manager_;
        settlementToken = IERC20(token);
        settlementUnit = 10 ** tokenDecimals;
        minSeed = MIN_SEED_UNITS * settlementUnit;
    }

    // ---- lifecycle

    /// @notice First deposit. Sets the starting price by convention: 1 share = 1 settlement
    ///         token. Anyone can seed; the seeder does not have to be the manager.
    /// @param amount Settlement tokens to pull from the caller.
    /// @return shares Shares minted to the caller, after `DEAD_SHARES` are taken out.
    function seed(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (state != VaultState.DRAFT) revert WrongState(state);

        // Count what actually arrived, so a token that takes a fee cannot mint unbacked shares.
        uint256 balanceBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = settlementToken.balanceOf(address(this)) - balanceBefore;
        if (received < minSeed) revert BelowMinimumSeed(received, minSeed);

        // `received >= minSeed` means this is at least 10e18, so subtracting DEAD_SHARES is safe.
        shares = received * 1e18 / settlementUnit - DEAD_SHARES;

        _held.add(address(settlementToken));
        _setState(VaultState.SEEDED);
        _mint(DEAD, DEAD_SHARES);
        _mint(msg.sender, shares);

        emit Seeded(msg.sender, received, shares);
    }

    /// @notice Opens the vault to outside investors.
    function activate() external {
        _onlyGuardian();
        if (state != VaultState.SEEDED) revert WrongState(state);
        _setState(VaultState.ACTIVE);
    }

    /// @notice Emergency brake: stops deposits and manager trades.
    ///         Redemption keeps working.
    function pause() external {
        _onlyGuardian();
        if (state != VaultState.ACTIVE) revert WrongState(state);
        _setState(VaultState.PAUSED);
    }

    function unpause() external {
        _onlyGuardian();
        if (state != VaultState.PAUSED) revert WrongState(state);
        _setState(VaultState.ACTIVE);
    }

    // ---- investors

    /// @notice Buy shares at the fair price. The USDT stays in the vault as idle cash until the
    ///         manager invests it.
    /// @param amount Settlement tokens to pull from the caller.
    /// @param prices Stock prices signed by `registry.priceSigner()`, at most 60 seconds old.
    /// @param minShares The caller's own lower bound, in case the price moved.
    /// @return shares Shares minted to the caller.
    function deposit(uint256 amount, PriceUpdate calldata prices, bytes calldata signature, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (state != VaultState.ACTIVE) revert WrongState(state);
        registry.checkPrices(prices, signature);

        // Valued before the deposit arrives, so the newcomer buys in at the current price.
        uint256 valueBefore = _vaultValue(prices);
        if (valueBefore == 0) revert EmptyVault();

        uint256 balanceBefore = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = settlementToken.balanceOf(address(this)) - balanceBefore;

        shares = Math.mulDiv(received, totalSupply(), valueBefore);
        if (shares == 0) revert ZeroShares();
        if (shares < minShares) revert SlippageTooHigh(shares, minShares);

        _mint(msg.sender, shares);
        emit Deposited(msg.sender, received, shares, valueBefore, prices.timestamp);
    }

    /// @notice Burn shares and receive the same percentage of every asset the vault holds, idle
    ///         USDT included. No price is used, and no state blocks it: exit is always open.
    /// @return assets Every held asset, in `heldAssets()` order.
    /// @return amounts What `to` received of each, rounded down.
    function redeem(uint256 shares, address to)
        external
        nonReentrant
        returns (address[] memory assets, uint256[] memory amounts)
    {
        return _redeem(shares, to, new address[](0));
    }

    /// @notice Same as `redeem`, but gives up the assets in `forfeit`: the caller's slice of those
    ///         stays in the vault for the remaining holders. The escape hatch for a held token that
    ///         cannot move (paused by its issuer, or blacklisting the vault), so it never blocks exit.
    function redeemExcept(uint256 shares, address to, address[] calldata forfeit)
        external
        nonReentrant
        returns (address[] memory assets, uint256[] memory amounts)
    {
        return _redeem(shares, to, forfeit);
    }

    function _redeem(uint256 shares, address to, address[] memory forfeit)
        internal
        returns (address[] memory assets, uint256[] memory amounts)
    {
        if (shares == 0) revert NothingToRedeem();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender == DEAD) revert DeadSharesLocked();

        uint256 supply = totalSupply();
        if (supply == 0) revert NothingToRedeem();
        assets = _held.values();
        amounts = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            if (_contains(forfeit, assets[i])) continue;
            amounts[i] = Math.mulDiv(IERC20(assets[i]).balanceOf(address(this)), shares, supply);
        }

        // Burn first: reverts if the caller holds fewer shares, before any token moves.
        _burn(msg.sender, shares);
        for (uint256 i; i < assets.length; ++i) {
            if (amounts[i] != 0) IERC20(assets[i]).safeTransfer(to, amounts[i]);
        }

        emit Redeemed(msg.sender, shares, assets, amounts);
    }

    // ---- manager

    /// @notice Publish (or replace) the investment plan. Any text; investors read it and decide.
    function setPlan(string calldata text) external {
        _onlyManager();
        uint256 length = bytes(text).length;
        if (length == 0 || length > MAX_PLAN_LENGTH) revert InvalidPlanLength();
        plan = text;
        emit PlanPosted(++planVersion, text);
    }

    /// @notice Swap one held token for another through an allowlisted router. The calldata is
    ///         opaque, so the vault judges the trade only by its own balances afterwards (spec §6):
    ///         it sold at most `maxSellAmount`, got at least `minBuyAmount`, lost at most 2% of
    ///         value at the signed prices, and nothing else it holds went down.
    /// @param prices Signed prices for every non-USDT token in the trade, at most 60 seconds old.
    ///        They set the minimum the vault must get back, so the manager cannot choose it alone.
    function rebalance(TradeRequest calldata t, PriceUpdate calldata prices, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 sold, uint256 bought)
    {
        _onlyManager();
        if (state != VaultState.ACTIVE) revert WrongState(state);
        if (planVersion == 0) revert NoPlanPosted();
        // A router that is also a token could be sent `approve(thief)`, which moves no balance.
        if (!registry.isRouter(t.router) || registry.isAsset(t.router)) revert RouterNotAllowed();
        if (t.sellToken == t.buyToken || !registry.isAsset(t.buyToken)) revert AssetNotAllowed();
        if (!_held.contains(t.sellToken)) revert AssetNotHeld();
        registry.checkPrices(prices, signature);

        address[] memory assets = _held.values();
        uint256[] memory before = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            before[i] = IERC20(assets[i]).balanceOf(address(this));
        }
        uint256 sellBefore = IERC20(t.sellToken).balanceOf(address(this));
        uint256 buyBefore = IERC20(t.buyToken).balanceOf(address(this));

        IERC20(t.sellToken).forceApprove(t.router, t.maxSellAmount);
        Address.functionCall(t.router, t.callData);
        IERC20(t.sellToken).forceApprove(t.router, 0); // never leave an allowance behind

        uint256 sellAfter = IERC20(t.sellToken).balanceOf(address(this));
        uint256 buyAfter = IERC20(t.buyToken).balanceOf(address(this));
        if (buyAfter < buyBefore) revert CollateralDecreased(t.buyToken);
        sold = sellBefore > sellAfter ? sellBefore - sellAfter : 0;
        bought = buyAfter - buyBefore;
        if (sold > t.maxSellAmount) revert SellExceeded(sold, t.maxSellAmount);
        if (bought == 0 || bought < t.minBuyAmount) revert BuyTooLow(bought, t.minBuyAmount);
        for (uint256 i; i < assets.length; ++i) {
            if (assets[i] == t.sellToken || assets[i] == t.buyToken) continue;
            if (IERC20(assets[i]).balanceOf(address(this)) < before[i]) {
                revert CollateralDecreased(assets[i]);
            }
        }

        // Value sold rounds up and value bought rounds down, so rounding never hides a loss.
        uint256 valueSold = _valueOf(prices, t.sellToken, sold, Math.Rounding.Ceil);
        uint256 valueBought = _valueOf(prices, t.buyToken, bought, Math.Rounding.Floor);
        if (valueBought * 10_000 < valueSold * (10_000 - MAX_TRADE_LOSS_BPS)) {
            revert TradeLossTooHigh(valueSold, valueBought);
        }

        // Drop first, so a full vault can still swap one stock entirely into a new one.
        // The leftover is no longer counted in deposits or paid out in redeems.
        if (t.sellToken != address(settlementToken) && sellAfter <= _dust(t.sellToken)) {
            _held.remove(t.sellToken);
        }
        if (_held.add(t.buyToken) && _held.length() > MAX_ASSETS) revert TooManyAssets();

        emit Rebalanced(t.sellToken, t.buyToken, sold, bought, planVersion);
    }

    // ---- internals

    /// @dev `amount` of `asset` in settlement units: USDT at par, anything else at its signed price.
    function _valueOf(PriceUpdate calldata prices, address asset, uint256 amount, Math.Rounding rounding)
        internal
        view
        returns (uint256)
    {
        if (asset == address(settlementToken)) return amount;
        uint256 unit = 10 ** IERC20Metadata(asset).decimals();
        return Math.mulDiv(amount, _priceOf(prices, asset), unit, rounding);
    }

    /// @dev Settlement token at par, every other held asset at its signed price. Rounded up, so
    ///      a newcomer can never buy in below the true value.
    function _vaultValue(PriceUpdate calldata prices) internal view returns (uint256 value) {
        address[] memory assets = _held.values();
        for (uint256 i; i < assets.length; ++i) {
            uint256 balance = IERC20(assets[i]).balanceOf(address(this));
            if (balance == 0) continue; // a sold-out holding adds nothing and needs no price
            value += _valueOf(prices, assets[i], balance, Math.Rounding.Ceil);
        }
    }

    function _contains(address[] memory list, address item) internal pure returns (bool) {
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == item) return true;
        }
        return false;
    }

    /// @dev A held asset without a price must never count as worth zero.
    function _priceOf(PriceUpdate calldata prices, address asset) internal pure returns (uint256) {
        for (uint256 i; i < prices.assets.length; ++i) {
            if (prices.assets[i] == asset) {
                if (prices.prices[i] == 0) revert ZeroPrice(asset);
                return prices.prices[i];
            }
        }
        revert MissingPrice(asset);
    }

    /// @dev One millionth of a whole token: 1e12 wei for an 18-decimal stock.
    function _dust(address asset) internal view returns (uint256) {
        return 10 ** IERC20Metadata(asset).decimals() / DUST_DIVISOR;
    }

    function _onlyManager() internal view {
        if (msg.sender != manager) revert NotManager();
    }

    function _onlyGuardian() internal view {
        if (msg.sender != registry.guardian()) revert NotGuardian();
    }

    function _setState(VaultState to) internal {
        emit StateChanged(state, to);
        state = to;
    }

    /// @dev Shares can be minted and burned but not moved between accounts (spec §9).
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert TransfersDisabled();
        super._update(from, to, value);
    }

    // ---- views

    function heldAssets() external view returns (address[] memory) {
        return _held.values();
    }

    function holdings() external view returns (address[] memory assets, uint256[] memory amounts) {
        assets = _held.values();
        amounts = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            amounts[i] = IERC20(assets[i]).balanceOf(address(this));
        }
    }

    function shareOf(address account) external view returns (uint256) {
        return balanceOf(account);
    }
}
