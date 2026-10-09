// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {MockPausableERC20} from "./mocks/MockERC20.sol";
import {FolioVaultHarness} from "./helpers/FolioVaultHarness.sol";
import {VaultFixture} from "./helpers/VaultFixture.sol";

contract FolioVaultRedeemTest is VaultFixture {
    uint256 internal constant BOB_SHARES = 1_000e18 - DEAD_SHARES;

    function setUp() public override {
        super.setUp();
        // Bob seeds 1,000; the manager has bought: vault holds 600 USDT + 2 AAPL, 1,000 shares.
        _seedAndActivate(1_000e18);
        _simulateBuy(400e18, 2e18);
    }

    function test_redeem_paysTheSamePercentOfEveryAsset() public {
        vm.prank(bob);
        (address[] memory assets, uint256[] memory amounts) = vault.redeem(100e18, bob); // 10%

        assertEq(assets.length, 2);
        assertEq(assets[0], address(usdt));
        assertEq(assets[1], address(aapl));
        assertEq(amounts[0], 60e18, "10% of 600 USDT");
        assertEq(amounts[1], 0.2e18, "10% of 2 AAPL");
        assertEq(usdt.balanceOf(bob), 60e18);
        assertEq(aapl.balanceOf(bob), 0.2e18);
        assertEq(usdt.balanceOf(address(vault)), 540e18);
        assertEq(aapl.balanceOf(address(vault)), 1.8e18);
    }

    function test_redeem_burnsTheShares() public {
        vm.prank(bob);
        vault.redeem(100e18, bob);

        assertEq(vault.balanceOf(bob), BOB_SHARES - 100e18);
        assertEq(vault.totalSupply(), 900e18);
    }

    function test_redeem_emitsRedeemed() public {
        address[] memory assets = new address[](2);
        assets[0] = address(usdt);
        assets[1] = address(aapl);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 60e18;
        amounts[1] = 0.2e18;

        vm.expectEmit(address(vault));
        emit FolioVault.Redeemed(bob, 100e18, assets, amounts);
        vm.prank(bob);
        vault.redeem(100e18, bob);
    }

    function test_redeem_canPayAnotherAddress() public {
        vm.prank(bob);
        vault.redeem(100e18, carol);

        assertEq(usdt.balanceOf(carol), 60e18);
        assertEq(aapl.balanceOf(carol), 0.2e18);
        assertEq(usdt.balanceOf(bob), 0);
        assertEq(vault.balanceOf(bob), BOB_SHARES - 100e18);
    }

    function test_redeem_fullExitLeavesDeadSharesBacked() public {
        vm.prank(bob);
        vault.redeem(BOB_SHARES, bob);

        assertEq(vault.totalSupply(), DEAD_SHARES, "only dead shares remain");
        assertEq(usdt.balanceOf(bob), 599.9994e18);
        assertEq(aapl.balanceOf(bob), 1.999998e18);
        assertEq(usdt.balanceOf(address(vault)), 0.0006e18, "dead shares' slice stays");
        assertEq(aapl.balanceOf(address(vault)), 0.000002e18);
    }

    function test_redeem_roundsDownSoDustStays() public {
        vm.prank(bob);
        (, uint256[] memory amounts) = vault.redeem(1, bob); // 1 wei of shares

        assertEq(amounts[0], 0, "600e18 * 1 / 1000e18 rounds to 0");
        assertEq(amounts[1], 0);
        assertEq(vault.totalSupply(), 1_000e18 - 1, "the share is still burned");
        assertEq(usdt.balanceOf(address(vault)), 600e18);
    }

    function test_redeem_worksWhilePaused() public {
        vm.prank(guardian);
        vault.pause();

        vm.prank(bob);
        vault.redeem(100e18, bob);

        assertEq(usdt.balanceOf(bob), 60e18);
    }

    function test_redeem_seedInvestorCanRecoverBeforeActivation() public {
        FolioVaultHarness fresh = new FolioVaultHarness(registry, manager);
        usdt.mint(carol, 100e18);
        vm.prank(carol);
        usdt.approve(address(fresh), 100e18);
        vm.prank(carol);
        uint256 shares = fresh.seed(100e18);

        vm.prank(carol);
        fresh.redeem(shares, carol);

        assertEq(usdt.balanceOf(carol), 100e18 - DEAD_SHARES, "all but the dead shares' slice");
        assertEq(uint8(fresh.state()), uint8(FolioVault.VaultState.SEEDED));
    }

    function test_redeem_revertsOnZeroShares() public {
        vm.expectRevert(FolioVault.NothingToRedeem.selector);
        vm.prank(bob);
        vault.redeem(0, bob);
    }

    function test_redeem_revertsOnZeroRecipient() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        vm.prank(bob);
        vault.redeem(100e18, address(0));
    }

    function test_redeem_revertsBeyondBalance() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, bob, BOB_SHARES, BOB_SHARES + 1
            )
        );
        vm.prank(bob);
        vault.redeem(BOB_SHARES + 1, bob);
    }

    function test_redeem_revertsForAccountWithNoShares() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, mallory, 0, 1e18)
        );
        vm.prank(mallory);
        vault.redeem(1e18, mallory);
    }

    function test_redeem_deadSharesAreLocked() public {
        vm.expectRevert(FolioVault.DeadSharesLocked.selector);
        vm.prank(DEAD);
        vault.redeem(DEAD_SHARES, mallory);
    }

    function testFuzz_redeem_isExactlyProportional(uint256 shares) public {
        shares = bound(shares, 1, BOB_SHARES);
        uint256 supply = vault.totalSupply();

        vm.prank(bob);
        (, uint256[] memory amounts) = vault.redeem(shares, bob);

        assertEq(amounts[0], 600e18 * shares / supply);
        assertEq(amounts[1], 2e18 * shares / supply);
        assertEq(usdt.balanceOf(address(vault)), 600e18 - amounts[0], "nothing else left the vault");
        assertEq(aapl.balanceOf(address(vault)), 2e18 - amounts[1]);
    }

    // ---- a held token that cannot move

    function _holdPausedStock() internal returns (MockPausableERC20 stock) {
        stock = new MockPausableERC20();
        stock.mint(address(vault), 5e18);
        vault.addHeldAsset(address(stock));
        stock.setPaused(true);
    }

    function test_redeem_revertsWhenAHeldTokenIsPaused() public {
        _holdPausedStock();

        vm.expectRevert(MockPausableERC20.TokenPaused.selector);
        vm.prank(bob);
        vault.redeem(100e18, bob);
    }

    function test_redeemExcept_skipsAPausedTokenSoExitStillWorks() public {
        MockPausableERC20 stock = _holdPausedStock();
        address[] memory forfeit = new address[](1);
        forfeit[0] = address(stock);

        vm.prank(bob);
        (address[] memory assets, uint256[] memory amounts) = vault.redeemExcept(100e18, bob, forfeit);

        assertEq(assets[2], address(stock));
        assertEq(amounts[0], 60e18, "10% of the USDT");
        assertEq(amounts[1], 0.2e18, "10% of the AAPL");
        assertEq(amounts[2], 0, "forfeited leg pays nothing");
        assertEq(usdt.balanceOf(bob), 60e18);
        assertEq(stock.balanceOf(address(vault)), 5e18, "forfeited tokens stay for remaining holders");
        assertEq(vault.totalSupply(), 900e18, "shares are burned in full");
    }

    function test_redeemExcept_withEmptyListMatchesRedeem() public {
        vm.prank(bob);
        (, uint256[] memory amounts) = vault.redeemExcept(100e18, bob, new address[](0));

        assertEq(amounts[0], 60e18);
        assertEq(amounts[1], 0.2e18);
    }

    function test_redeem_inDraftRevertsWithNamedError() public {
        FolioVaultHarness fresh = new FolioVaultHarness(registry, manager);

        vm.expectRevert(FolioVault.NothingToRedeem.selector);
        vm.prank(bob);
        fresh.redeem(1, bob);
    }
}
