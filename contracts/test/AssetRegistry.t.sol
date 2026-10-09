// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract AssetRegistryTest is Test {
    AssetRegistry internal registry;
    MockERC20 internal usdt;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal stranger = makeAddr("stranger");
    address internal stock = makeAddr("stock");
    address internal router = makeAddr("router");

    function setUp() public {
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
    }

    function test_constructor_setsRoles() public view {
        assertEq(registry.owner(), governance);
        assertEq(registry.guardian(), guardian);
        assertEq(registry.settlementToken(), address(usdt));
    }

    function test_constructor_settlementTokenIsAllowedAsset() public view {
        assertTrue(registry.isAsset(address(usdt)));
    }

    function test_constructor_revertsOnZeroGuardian() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        new AssetRegistry(governance, address(0), address(usdt));
    }

    function test_constructor_revertsOnZeroSettlementToken() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        new AssetRegistry(governance, guardian, address(0));
    }

    function test_setAsset_governanceCanAllowAndDisallow() public {
        vm.expectEmit(address(registry));
        emit AssetRegistry.AssetSet(stock, true);
        vm.prank(governance);
        registry.setAsset(stock, true);
        assertTrue(registry.isAsset(stock));

        vm.prank(governance);
        registry.setAsset(stock, false);
        assertFalse(registry.isAsset(stock));
    }

    function test_setAsset_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setAsset(stock, true);
    }

    function test_setAsset_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setAsset(address(0), true);
    }

    function test_setAsset_cannotDisallowSettlementToken() public {
        vm.expectRevert(AssetRegistry.SettlementTokenFixed.selector);
        vm.prank(governance);
        registry.setAsset(address(usdt), false);
    }

    function test_setRouter_governanceCanAllowAndDisallow() public {
        vm.expectEmit(address(registry));
        emit AssetRegistry.RouterSet(router, true);
        vm.prank(governance);
        registry.setRouter(router, true);
        assertTrue(registry.isRouter(router));

        vm.prank(governance);
        registry.setRouter(router, false);
        assertFalse(registry.isRouter(router));
    }

    function test_renounceOwnership_isDisabled() public {
        vm.expectRevert(AssetRegistry.RenounceDisabled.selector);
        vm.prank(governance);
        registry.renounceOwnership();

        assertEq(registry.owner(), governance);
    }

    function test_setRouter_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        registry.setRouter(router, true);
    }

    function test_setRouter_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setRouter(address(0), true);
    }

    function test_setGuardian_governanceCanRotate() public {
        address newGuardian = makeAddr("newGuardian");
        vm.expectEmit(address(registry));
        emit AssetRegistry.GuardianSet(guardian, newGuardian);
        vm.prank(governance);
        registry.setGuardian(newGuardian);
        assertEq(registry.guardian(), newGuardian);
    }

    function test_setGuardian_revertsForGuardianItself() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setGuardian(stranger);
    }

    function test_setGuardian_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setGuardian(address(0));
    }

    function test_governanceHandover_isTwoStep() public {
        address newGovernance = makeAddr("newGovernance");
        vm.prank(governance);
        registry.transferOwnership(newGovernance);
        assertEq(registry.owner(), governance, "old owner stays until accepted");

        vm.prank(newGovernance);
        registry.acceptOwnership();
        assertEq(registry.owner(), newGovernance);
    }

    // ---- signed prices

    uint256 internal constant SIGNER_KEY = 0xA11CE;

    function _setSigner(address signer) internal {
        vm.prank(governance);
        registry.setPriceSigner(signer);
    }

    function _oneAsset(uint256 price, uint64 timestamp) internal view returns (PriceUpdate memory update) {
        address[] memory assets = new address[](1);
        assets[0] = stock;
        uint256[] memory prices = new uint256[](1);
        prices[0] = price;
        update = PriceUpdate({assets: assets, prices: prices, timestamp: timestamp});
    }

    function _signWith(uint256 key, PriceUpdate memory update) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        return abi.encodePacked(r, s, v);
    }

    function test_setPriceSigner_governanceCanSet() public {
        address signer = vm.addr(SIGNER_KEY);
        vm.expectEmit(address(registry));
        emit AssetRegistry.PriceSignerSet(address(0), signer);
        _setSigner(signer);
        assertEq(registry.priceSigner(), signer);
    }

    function test_setPriceSigner_revertsForNonGovernance() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, guardian));
        vm.prank(guardian);
        registry.setPriceSigner(guardian);
    }

    function test_setPriceSigner_revertsOnZeroAddress() public {
        vm.expectRevert(AssetRegistry.ZeroAddress.selector);
        vm.prank(governance);
        registry.setPriceSigner(address(0));
    }

    function test_checkPrices_acceptsFreshSignedPrices() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        registry.checkPrices(update, _signWith(SIGNER_KEY, update));
    }

    function test_checkPrices_acceptsExactlyMaxAge() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp - 60));
        registry.checkPrices(update, _signWith(SIGNER_KEY, update));
    }

    function test_checkPrices_rejectsOlderThanMaxAge() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp - 61));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.StalePrices.selector, uint64(block.timestamp - 61))
        );
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsFutureTimestamp() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp + 1));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.StalePrices.selector, uint64(block.timestamp + 1))
        );
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsWrongSigner() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(0xBAD, update);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsTamperedPrice() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        update.prices[0] = 1e18;
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsWhenNoSignerSet() public {
        vm.warp(1_800_000_000);
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        bytes memory signature = _signWith(SIGNER_KEY, update);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, signature);
    }

    function test_checkPrices_rejectsGarbageSignature() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        registry.checkPrices(update, hex"1234");
    }

    function test_checkPrices_rejectsLengthMismatch() public {
        vm.warp(1_800_000_000);
        _setSigner(vm.addr(SIGNER_KEY));
        PriceUpdate memory update = _oneAsset(335e18, uint64(block.timestamp));
        update.prices = new uint256[](2);
        vm.expectRevert(AssetRegistry.LengthMismatch.selector);
        registry.checkPrices(update, "");
    }

    /// @dev Signed off-chain with `cast wallet sign --data` (standard EIP-712 typed data), key 0xa1,
    ///      for this registry's address on chain 31337. Proves the backend can sign with ordinary
    ///      tooling and that array fields are encoded the standard way.
    function test_checkPrices_acceptsSignatureFromStandardTooling() public {
        assertEq(
            address(registry),
            0x2e234DAe75C793f67A35089C9d99245E1C58470b,
            "registry address the vector was signed for"
        );
        _setSigner(0xd2431CA38735C2fd438e2cAa23F094191D89675b);

        address[] memory assets = new address[](2);
        assets[0] = 0x1111111111111111111111111111111111111111;
        assets[1] = 0x2222222222222222222222222222222222222222;
        uint256[] memory prices = new uint256[](2);
        prices[0] = 335.13e18;
        prices[1] = 180.5e18;
        vm.warp(1_800_000_000);

        registry.checkPrices(
            PriceUpdate({assets: assets, prices: prices, timestamp: 1_800_000_000}),
            hex"b6e9d8fb3c025491908aebc8d76f18d5894561ebb68e211427de3db1060f07c553b4013839eb51db36d4598774ec7f9e51ce97801abb1e9335b2602062d33b9f1b"
        );
    }
}
