// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {MockERC20, MockFeeERC20, MockReentrantERC20} from "./mocks/MockERC20.sol";

contract FolioVaultTest is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant DEAD_SHARES = 1e15;

    AssetRegistry internal registry;
    FolioVault internal vault;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal manager = makeAddr("manager");
    address internal seeder = makeAddr("seeder");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        (registry, vault, usdt) = _deploy(18);
    }

    function _deploy(uint8 decimals_) internal returns (AssetRegistry r, FolioVault v, MockERC20 t) {
        t = new MockERC20("Tether USD", "USDT", decimals_);
        r = new AssetRegistry(governance, guardian, address(t));
        v = new FolioVault(r, manager, "Folio Tech", "fTECH");
    }

    // ---- construction

    function test_constructor_setsConfig() public view {
        assertEq(vault.name(), "Folio Tech");
        assertEq(vault.symbol(), "fTECH");
        assertEq(vault.decimals(), 18);
        assertEq(address(vault.registry()), address(registry));
        assertEq(address(vault.settlementToken()), address(usdt));
        assertEq(vault.manager(), manager);
        assertEq(vault.DEAD(), DEAD);
        assertEq(vault.DEAD_SHARES(), DEAD_SHARES);
    }

    function test_constructor_startsEmptyInDraft() public view {
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.DRAFT));
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.heldAssets().length, 0);
        (address[] memory assets, uint256[] memory amounts) = vault.holdings();
        assertEq(assets.length, 0);
        assertEq(amounts.length, 0);
    }

    function test_constructor_minSeedIsTenUnits_18Decimals() public view {
        assertEq(vault.settlementUnit(), 1e18);
        assertEq(vault.minSeed(), 10e18);
    }

    function test_constructor_minSeedIsTenUnits_6Decimals() public {
        (, FolioVault v,) = _deploy(6);
        assertEq(v.settlementUnit(), 1e6);
        assertEq(v.minSeed(), 10e6);
    }

    function test_constructor_revertsOnZeroManager() public {
        vm.expectRevert(FolioVault.ZeroAddress.selector);
        new FolioVault(registry, address(0), "Folio Tech", "fTECH");
    }

    function test_constructor_revertsOnMoreThan18Decimals() public {
        MockERC20 weird = new MockERC20("Weird", "WRD", 24);
        AssetRegistry r = new AssetRegistry(governance, guardian, address(weird));
        vm.expectRevert(abi.encodeWithSelector(FolioVault.UnsupportedDecimals.selector, uint8(24)));
        new FolioVault(r, manager, "Folio Tech", "fTECH");
    }

    // ---- helpers

    function _seed(FolioVault v, MockERC20 t, address who, uint256 amount) internal returns (uint256 shares) {
        t.mint(who, amount);
        vm.prank(who);
        t.approve(address(v), amount);
        vm.prank(who);
        shares = v.seed(amount);
    }

    // ---- seed

    function test_seed_mintsOneSharePerUnit() public {
        uint256 shares = _seed(vault, usdt, seeder, 100e18);

        assertEq(shares, 100e18 - DEAD_SHARES, "return value");
        assertEq(vault.balanceOf(seeder), 100e18 - DEAD_SHARES, "seeder shares");
        assertEq(vault.shareOf(seeder), 100e18 - DEAD_SHARES, "shareOf");
        assertEq(vault.balanceOf(DEAD), DEAD_SHARES, "dead shares");
        assertEq(vault.totalSupply(), 100e18, "total supply");
    }

    function test_seed_movesMoneyIntoVault() public {
        _seed(vault, usdt, seeder, 100e18);

        assertEq(usdt.balanceOf(address(vault)), 100e18);
        assertEq(usdt.balanceOf(seeder), 0);
    }

    function test_seed_recordsSettlementTokenAsHeld() public {
        _seed(vault, usdt, seeder, 100e18);

        address[] memory held = vault.heldAssets();
        assertEq(held.length, 1);
        assertEq(held[0], address(usdt));

        (address[] memory assets, uint256[] memory amounts) = vault.holdings();
        assertEq(assets.length, 1);
        assertEq(assets[0], address(usdt));
        assertEq(amounts[0], 100e18);
    }

    function test_seed_movesToSeededAndEmits() public {
        usdt.mint(seeder, 100e18);
        vm.prank(seeder);
        usdt.approve(address(vault), 100e18);

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.DRAFT, FolioVault.VaultState.SEEDED);
        vm.expectEmit(address(vault));
        emit FolioVault.Seeded(seeder, 100e18, 100e18 - DEAD_SHARES);
        vm.prank(seeder);
        vault.seed(100e18);

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.SEEDED));
    }

    function test_seed_exactMinimumWorks() public {
        _seed(vault, usdt, seeder, 10e18);
        assertEq(vault.totalSupply(), 10e18);
    }

    function test_seed_revertsBelowMinimum() public {
        usdt.mint(seeder, 10e18);
        vm.prank(seeder);
        usdt.approve(address(vault), 10e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 10e18 - 1, 10e18));
        vm.prank(seeder);
        vault.seed(10e18 - 1);
    }

    function test_seed_revertsWhenAlreadySeeded() public {
        _seed(vault, usdt, seeder, 100e18);

        usdt.mint(stranger, 100e18);
        vm.prank(stranger);
        usdt.approve(address(vault), 100e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(stranger);
        vault.seed(100e18);
    }

    function test_seed_revertsWithoutAllowance() public {
        usdt.mint(seeder, 100e18);
        vm.expectRevert();
        vm.prank(seeder);
        vault.seed(100e18);
    }

    function test_seed_blocksReentrantSeed() public {
        MockReentrantERC20 evil = new MockReentrantERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(evil));
        FolioVault v = new FolioVault(r, manager, "Folio Evil", "fEVL");
        evil.mint(seeder, 100e18);
        vm.prank(seeder);
        evil.approve(address(v), 100e18);
        evil.arm(v);

        vm.prank(seeder);
        v.seed(100e18);

        assertFalse(evil.innerOk(), "inner seed must be blocked");
        assertEq(v.balanceOf(address(evil)), 0, "token minted itself no shares");
        assertEq(v.balanceOf(DEAD), DEAD_SHARES, "dead shares minted once");
    }

    function test_seed_sixDecimals_oneSharePerUnit() public {
        (, FolioVault v, MockERC20 t) = _deploy(6);
        uint256 shares = _seed(v, t, seeder, 100e6);

        assertEq(shares, 100e18 - DEAD_SHARES);
        assertEq(v.totalSupply(), 100e18);
        assertEq(t.balanceOf(address(v)), 100e6);
    }

    function test_seed_feeOnTransfer_mintsFromReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        FolioVault v = new FolioVault(r, manager, "Folio Fee", "fFEE");

        fee.mint(seeder, 100e18);
        vm.prank(seeder);
        fee.approve(address(v), 100e18);

        vm.expectEmit(address(v));
        emit FolioVault.Seeded(seeder, 99e18, 99e18 - DEAD_SHARES);
        vm.prank(seeder);
        uint256 shares = v.seed(100e18);

        assertEq(fee.balanceOf(address(v)), 99e18, "vault received 99");
        assertEq(v.totalSupply(), 99e18, "supply matches what arrived");
        assertEq(shares, 99e18 - DEAD_SHARES);
    }

    function test_seed_feeOnTransfer_minimumAppliesToReceived() public {
        MockFeeERC20 fee = new MockFeeERC20();
        AssetRegistry r = new AssetRegistry(governance, guardian, address(fee));
        FolioVault v = new FolioVault(r, manager, "Folio Fee", "fFEE");

        fee.mint(seeder, 10e18);
        vm.prank(seeder);
        fee.approve(address(v), 10e18);

        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 9.9e18, 10e18));
        vm.prank(seeder);
        v.seed(10e18);
    }

    function test_seed_ignoresPriorDonation() public {
        usdt.mint(address(vault), 50e18);

        uint256 shares = _seed(vault, usdt, seeder, 100e18);

        assertEq(shares, 100e18 - DEAD_SHARES, "shares come from the deposit only");
        assertEq(vault.totalSupply(), 100e18);
        assertEq(usdt.balanceOf(address(vault)), 150e18);
    }

    function testFuzz_seed_supplyIsAmountScaledTo18(uint8 decimals_, uint256 amount) public {
        decimals_ = uint8(bound(decimals_, 0, 18));
        (, FolioVault v, MockERC20 t) = _deploy(decimals_);
        uint256 unit = 10 ** decimals_;
        amount = bound(amount, 10 * unit, 1e12 * unit);

        uint256 shares = _seed(v, t, seeder, amount);

        assertEq(v.totalSupply(), amount * 10 ** (18 - decimals_), "1 share per unit");
        assertEq(v.balanceOf(DEAD), DEAD_SHARES, "dead shares fixed");
        assertEq(shares + DEAD_SHARES, v.totalSupply(), "nothing minted elsewhere");
    }

    // ---- share lock

    function test_transfer_reverts() public {
        _seed(vault, usdt, seeder, 100e18);

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(seeder);
        // Expected to revert, so unchecked transfer is intentional
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        vault.transfer(stranger, 1e18);
    }

    function test_transferFrom_reverts() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.prank(seeder);
        vault.approve(stranger, 1e18);

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(stranger);
        // Expected to revert, so unchecked transfer is intentional
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        vault.transferFrom(seeder, stranger, 1e18);
    }

    // ---- activate

    function test_activate_guardianMovesToActive() public {
        _seed(vault, usdt, seeder, 100e18);

        vm.expectEmit(address(vault));
        emit FolioVault.StateChanged(FolioVault.VaultState.SEEDED, FolioVault.VaultState.ACTIVE);
        vm.prank(guardian);
        vault.activate();

        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }

    function test_activate_revertsForManager() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(manager);
        vault.activate();
    }

    function test_activate_revertsForGovernance() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(governance);
        vault.activate();
    }

    function test_activate_revertsForSeeder() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(seeder);
        vault.activate();
    }

    function test_activate_revertsInDraft() public {
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.DRAFT));
        vm.prank(guardian);
        vault.activate();
    }

    function test_activate_revertsWhenAlreadyActive() public {
        _seed(vault, usdt, seeder, 100e18);
        vm.prank(guardian);
        vault.activate();

        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.ACTIVE));
        vm.prank(guardian);
        vault.activate();
    }

    function test_activate_followsGuardianRotation() public {
        _seed(vault, usdt, seeder, 100e18);
        address newGuardian = makeAddr("newGuardian");
        vm.prank(governance);
        registry.setGuardian(newGuardian);

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(guardian);
        vault.activate();

        vm.prank(newGuardian);
        vault.activate();
        assertEq(uint8(vault.state()), uint8(FolioVault.VaultState.ACTIVE));
    }
}
