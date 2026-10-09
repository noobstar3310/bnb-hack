// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry, PriceUpdate} from "../src/AssetRegistry.sol";
import {FolioVault} from "../src/FolioVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice A story, not a unit test: several people use the system in order, and the test prints
///         what happens at each step. Run it with:
///
///             forge test --match-contract SimulationTest -vv
///
///         Cast:
///           team     governance (slow admin) and guardian (fast admin)
///           backend  price signer: signs stock prices before every deposit
///           Alice    curator, manages the first vault
///           Bob      first investor, seeds Alice's vault
///           Carol    second investor
///           Dave     curator, manages the second vault
///           Mallory  attacker
contract SimulationTest is Test {
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address internal governance = makeAddr("governance");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal mallory = makeAddr("mallory");

    uint256 internal constant PRICE_SIGNER_KEY = 0xBAC4E2D;
    address internal priceSigner = vm.addr(PRICE_SIGNER_KEY);

    MockERC20 internal usdt;
    MockERC20 internal appleStock;
    address internal router = makeAddr("binanceRouter");

    AssetRegistry internal registry;
    VaultFactory internal factory;
    FolioVault internal aliceVault;
    FolioVault internal daveVault;

    function test_simulation_multiUserStory() public {
        _ch0TeamDeploysTheSystem();
        _ch1GovernanceSetsTheRules();
        _ch2AliceCreatesAVault();
        _ch3BobSeedsIt();
        _ch4CarolIsTooLateToSeed();
        _ch5SharesCannotBeMoved();
        _ch6OnlyTheGuardianActivates();
        _ch7DaveRunsASecondVault();
        _ch8CarolDepositsAfterActivation();
        _ch9PauseBlocksDepositsNotExits();
        _ch10FinalBooks();
    }

    // ---- chapters

    function _ch0TeamDeploysTheSystem() internal {
        _title("0. The team deploys the system");

        vm.warp(1_800_000_000); // a realistic clock, so price timestamps look like real ones
        usdt = new MockERC20("Tether USD", "USDT", 18);
        registry = new AssetRegistry(governance, guardian, address(usdt));
        factory = new VaultFactory(registry);

        assertEq(registry.owner(), governance);
        assertEq(registry.guardian(), guardian);
        assertTrue(registry.isAsset(address(usdt)));

        _say("AssetRegistry and VaultFactory are live.");
        _say("USDT is the money. It is allowed from day one and can never be removed.");
    }

    function _ch1GovernanceSetsTheRules() internal {
        _title("1. Governance decides what vaults may hold and where they may trade");

        appleStock = new MockERC20("Apple (Ondo)", "AAPLon", 18);
        vm.startPrank(governance);
        registry.setAsset(address(appleStock), true);
        registry.setRouter(router, true);
        registry.setPriceSigner(priceSigner);
        vm.stopPrank();

        assertTrue(registry.isAsset(address(appleStock)));
        assertTrue(registry.isRouter(router));
        _say("Governance allowed AAPLon and one router, and named the backend's price signer.");

        MockERC20 scamToken = new MockERC20("Totally Real Apple", "AAPL", 18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vm.prank(mallory);
        registry.setAsset(address(scamToken), true);

        assertFalse(registry.isAsset(address(scamToken)));
        _say("Mallory tried to allow her own scam token: REVERTED (she is not governance).");
    }

    function _ch2AliceCreatesAVault() internal {
        _title("2. Alice becomes a curator");

        vm.prank(alice);
        aliceVault = FolioVault(factory.createVault("Alice Tech Fund", "fTECH", alice));

        assertTrue(factory.isVault(address(aliceVault)));
        assertEq(aliceVault.manager(), alice);
        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.DRAFT));
        assertEq(aliceVault.totalSupply(), 0);

        _say("Alice created 'Alice Tech Fund'. Nobody had to approve that.");
        _say(
            string.concat("Vault state: ", _stateName(aliceVault.state()), ". It is empty and has no shares.")
        );
    }

    function _ch3BobSeedsIt() internal {
        _title("3. Bob puts in the first money (the seed)");

        _fund(bob, aliceVault, 1_000e18);
        vm.prank(bob);
        uint256 bobShares = aliceVault.seed(1_000e18);

        assertEq(bobShares, 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(bob), 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(DEAD), 1e15);
        assertEq(aliceVault.totalSupply(), 1_000e18);
        assertEq(usdt.balanceOf(address(aliceVault)), 1_000e18);
        assertEq(usdt.balanceOf(bob), 0);
        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.SEEDED));

        _say("Bob deposited 1000 USDT. 1 share = 1 USDT at the seed.");
        _say(string.concat("Bob's shares:  ", _units(aliceVault.balanceOf(bob))));
        _say(
            string.concat(
                "Dead shares:   ",
                _units(aliceVault.balanceOf(DEAD)),
                "  (locked forever, blocks the inflation attack)"
            )
        );
        _say(string.concat("Total supply:  ", _units(aliceVault.totalSupply())));
        _say(string.concat("Vault state:   ", _stateName(aliceVault.state())));
    }

    function _ch4CarolIsTooLateToSeed() internal {
        _title("4. Carol also wants to seed Alice's vault");

        _fund(carol, aliceVault, 500e18);
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.SEEDED));
        vm.prank(carol);
        aliceVault.seed(500e18);

        assertEq(usdt.balanceOf(carol), 500e18, "Carol keeps her money");
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("REVERTED: a vault is seeded exactly once. Carol still has her 500 USDT.");
        _say("She can deposit normally once the vault is ACTIVE (chapter 8).");
    }

    function _ch5SharesCannotBeMoved() internal {
        _title("5. Bob tries to hand some shares to Carol");

        vm.expectRevert(FolioVault.TransfersDisabled.selector);
        vm.prank(bob);
        // Expected to revert, so the return value is never produced.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        aliceVault.transfer(carol, 100e18);

        assertEq(aliceVault.balanceOf(bob), 1_000e18 - 1e15);
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("REVERTED: shares can be minted and burned, never transferred.");
    }

    function _ch6OnlyTheGuardianActivates() internal {
        _title("6. Opening the vault to the public");

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(alice);
        aliceVault.activate();
        _say("Alice tried to activate her own vault: REVERTED (the manager is not the guardian).");

        vm.expectRevert(FolioVault.NotGuardian.selector);
        vm.prank(mallory);
        aliceVault.activate();
        _say("Mallory tried too: REVERTED.");

        vm.prank(guardian);
        aliceVault.activate();

        assertEq(uint8(aliceVault.state()), uint8(FolioVault.VaultState.ACTIVE));
        _say(string.concat("The guardian activated it. Vault state: ", _stateName(aliceVault.state())));
    }

    function _ch7DaveRunsASecondVault() internal {
        _title("7. Dave starts a second, separate vault");

        vm.prank(dave);
        daveVault = FolioVault(factory.createVault("Dave Dividend Fund", "fDIV", dave));
        assertEq(factory.vaultCount(), 2);

        // Carol approved Alice's vault earlier; she now approves Dave's and tries a tiny seed.
        vm.prank(carol);
        usdt.approve(address(daveVault), 500e18);
        vm.expectRevert(abi.encodeWithSelector(FolioVault.BelowMinimumSeed.selector, 5e18, 10e18));
        vm.prank(carol);
        daveVault.seed(5e18);
        _say("Carol tried to seed Dave's vault with 5 USDT: REVERTED (minimum is 10).");

        vm.prank(carol);
        daveVault.seed(250e18);

        assertEq(daveVault.balanceOf(carol), 250e18 - 1e15);
        assertEq(usdt.balanceOf(address(daveVault)), 250e18);
        assertEq(usdt.balanceOf(carol), 250e18);
        assertEq(uint8(daveVault.state()), uint8(FolioVault.VaultState.SEEDED));
        _say("Carol seeded it with 250 USDT instead. She keeps the other 250.");

        // Nothing that happened in Dave's vault touched Alice's.
        assertEq(usdt.balanceOf(address(aliceVault)), 1_000e18);
        assertEq(aliceVault.totalSupply(), 1_000e18);
        assertEq(aliceVault.balanceOf(carol), 0);
        _say("Alice's vault did not change: each vault has its own money and its own shares.");
    }

    function _ch8CarolDepositsAfterActivation() internal {
        _title("8. Carol joins Alice's vault now that it is ACTIVE");

        (PriceUpdate memory prices, bytes memory signature) = _backendSignsPrices();
        vm.prank(carol);
        usdt.approve(address(aliceVault), 200e18);
        vm.prank(carol);
        uint256 shares = aliceVault.deposit(200e18, prices, signature, 0);

        assertEq(shares, 200e18);
        assertEq(aliceVault.balanceOf(carol), 200e18);
        assertEq(usdt.balanceOf(address(aliceVault)), 1_200e18);
        _say("The backend signed fresh prices, and Carol deposited 200 USDT.");
        _say(
            string.concat(
                "Carol's shares: ", _units(shares), "  (the vault is all cash, so 1 share = 1 USDT)"
            )
        );
        _say("Her USDT sits idle in the vault until Alice invests it (SC-04).");

        (PriceUpdate memory fake, bytes memory fakeSignature) =
            _sign(0xBAD, new address[](0), new uint256[](0));
        usdt.mint(mallory, 100e18);
        vm.prank(mallory);
        usdt.approve(address(aliceVault), 100e18);
        vm.expectRevert(AssetRegistry.InvalidPriceSignature.selector);
        vm.prank(mallory);
        aliceVault.deposit(100e18, fake, fakeSignature, 0);
        _say("Mallory signed her own prices: REVERTED (she is not the price signer).");

        vm.warp(block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.StalePrices.selector, prices.timestamp));
        vm.prank(carol);
        aliceVault.deposit(10e18, prices, signature, 0);
        _say("Carol reused the same signed prices 61 seconds later: REVERTED (older than 60 s).");
    }

    function _ch9PauseBlocksDepositsNotExits() internal {
        _title("9. Something looks wrong: the guardian pulls the emergency brake");

        vm.prank(guardian);
        aliceVault.pause();
        _say(string.concat("Vault state: ", _stateName(aliceVault.state())));

        (PriceUpdate memory prices, bytes memory signature) = _backendSignsPrices();
        vm.expectRevert(abi.encodeWithSelector(FolioVault.WrongState.selector, FolioVault.VaultState.PAUSED));
        vm.prank(carol);
        aliceVault.deposit(10e18, prices, signature, 0);
        _say("Carol tried to deposit more: REVERTED (paused).");

        vm.prank(bob);
        (, uint256[] memory amounts) = aliceVault.redeem(500e18, bob);
        assertEq(amounts[0], 500e18);
        assertEq(usdt.balanceOf(bob), 500e18);
        _say("Bob withdrew 500 shares anyway and got 500 USDT back. A pause never traps anyone.");

        vm.prank(guardian);
        aliceVault.unpause();
        _say(string.concat("The guardian unpaused. Vault state: ", _stateName(aliceVault.state())));
    }

    function _ch10FinalBooks() internal view {
        _title("10. Final books");

        _say("Alice Tech Fund (ACTIVE)");
        _say(string.concat("  holds     ", _units(usdt.balanceOf(address(aliceVault))), " USDT"));
        _say(string.concat("  Bob       ", _units(aliceVault.balanceOf(bob)), " shares"));
        _say(string.concat("  Carol     ", _units(aliceVault.balanceOf(carol)), " shares"));
        _say(string.concat("  dead      ", _units(aliceVault.balanceOf(DEAD)), " shares"));
        _say("Dave Dividend Fund (SEEDED, waiting for the guardian)");
        _say(string.concat("  holds     ", _units(usdt.balanceOf(address(daveVault))), " USDT"));
        _say(string.concat("  Carol     ", _units(daveVault.balanceOf(carol)), " shares"));
        _say(string.concat("  dead      ", _units(daveVault.balanceOf(DEAD)), " shares"));

        // Every share is accounted for, and every share is backed by one USDT (both vaults are all cash).
        assertEq(
            aliceVault.balanceOf(bob) + aliceVault.balanceOf(carol) + aliceVault.balanceOf(DEAD),
            aliceVault.totalSupply()
        );
        assertEq(daveVault.balanceOf(carol) + daveVault.balanceOf(DEAD), daveVault.totalSupply());
        assertEq(usdt.balanceOf(address(aliceVault)), aliceVault.totalSupply());
        assertEq(usdt.balanceOf(address(daveVault)), daveVault.totalSupply());

        // Alice, Dave and Mallory never deposited, so they own nothing.
        assertEq(aliceVault.balanceOf(alice), 0);
        assertEq(daveVault.balanceOf(dave), 0);
        assertEq(aliceVault.balanceOf(mallory) + daveVault.balanceOf(mallory), 0);
        assertEq(usdt.balanceOf(mallory), 100e18, "Mallory's failed deposit cost her nothing");

        _say("");
        _say("Not possible yet: manager trades (SC-04), replace manager and close a vault (SC-06).");
    }

    // ---- helpers

    function _fund(address who, FolioVault vault, uint256 amount) internal {
        usdt.mint(who, amount);
        vm.prank(who);
        usdt.approve(address(vault), amount);
    }

    /// @dev What the backend does before each deposit: sign fresh prices. Alice's vault holds only
    ///      USDT so far, so the list is empty; the signature still proves the prices are fresh.
    function _backendSignsPrices() internal view returns (PriceUpdate memory prices, bytes memory signature) {
        return _sign(PRICE_SIGNER_KEY, new address[](0), new uint256[](0));
    }

    function _sign(uint256 key, address[] memory assets, uint256[] memory prices)
        internal
        view
        returns (PriceUpdate memory update, bytes memory signature)
    {
        update = PriceUpdate({assets: assets, prices: prices, timestamp: uint64(block.timestamp)});
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, registry.hashPriceUpdate(update));
        signature = abi.encodePacked(r, s, v);
    }

    function _title(string memory line) internal pure {
        console.log("");
        console.log(string.concat("== ", line));
    }

    function _say(string memory line) internal pure {
        console.log(string.concat("   ", line));
    }

    /// @dev 18-decimal amount as a string with three decimals, e.g. 999.999.
    function _units(uint256 wad) internal pure returns (string memory) {
        uint256 thousandths = (wad % 1e18) / 1e15;
        string memory pad = thousandths < 10 ? "00" : thousandths < 100 ? "0" : "";
        return string.concat(vm.toString(wad / 1e18), ".", pad, vm.toString(thousandths));
    }

    function _stateName(FolioVault.VaultState s) internal pure returns (string memory) {
        if (s == FolioVault.VaultState.DRAFT) return "DRAFT";
        if (s == FolioVault.VaultState.SEEDED) return "SEEDED";
        if (s == FolioVault.VaultState.ACTIVE) return "ACTIVE";
        if (s == FolioVault.VaultState.PAUSED) return "PAUSED";
        return "CLOSED";
    }
}
