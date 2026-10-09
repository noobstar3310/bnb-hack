// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

struct PriceUpdate {
    address[] assets;
    uint256[] prices;
    uint64 timestamp;
}

/// @notice Rules shared by every vault: which tokens and routers are permitted, which token is
///         money, and who the guardian is. The owner is governance (a timelock in production),
///         so every change here is slow on purpose. The guardian is the fast emergency role.
contract AssetRegistry is Ownable2Step, EIP712 {
    uint256 public constant MAX_PRICE_AGE = 60;
    bytes32 public constant PRICE_UPDATE_TYPEHASH =
        keccak256("PriceUpdate(address[] assets,uint256[] prices,uint64 timestamp)");
    address public priceSigner;
    error InvalidPriceSignature();
    error StalePrices(uint64 timestamp);
    error LengthMismatch();
    event PriceSignerSet(address indexed from, address indexed to);

    /// @notice The stablecoin every vault is seeded and subscribed in. Fixed at deploy.
    address public immutable settlementToken;

    /// @notice Can activate, pause and unpause vaults without a delay.
    address public guardian;

    mapping(address asset => bool allowed) public isAsset;
    mapping(address router => bool allowed) public isRouter;

    event GuardianSet(address indexed from, address indexed to);
    event AssetSet(address indexed asset, bool allowed);
    event RouterSet(address indexed router, bool allowed);

    error ZeroAddress();
    error SettlementTokenFixed();
    error RenounceDisabled();

    constructor(address governance, address guardian_, address settlementToken_)
        Ownable(governance)
        EIP712("Folio Lab", "1")
    {
        if (guardian_ == address(0) || settlementToken_ == address(0)) {
            revert ZeroAddress();
        }
        settlementToken = settlementToken_;
        guardian = guardian_;
        isAsset[settlementToken_] = true;
        emit GuardianSet(address(0), guardian_);
        emit AssetSet(settlementToken_, true);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit GuardianSet(guardian, newGuardian);
        guardian = newGuardian;
    }

    /// @dev The settlement token can never be removed: vaults must always be able to hold it.
    function setAsset(address asset, bool allowed) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        if (asset == settlementToken) revert SettlementTokenFixed();
        isAsset[asset] = allowed;
        emit AssetSet(asset, allowed);
    }

    function setRouter(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        isRouter[router] = allowed;
        emit RouterSet(router, allowed);
    }

    function setPriceSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit PriceSignerSet(priceSigner, newSigner);
        priceSigner = newSigner;
    }

    function hashPriceUpdate(PriceUpdate calldata update) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PRICE_UPDATE_TYPEHASH,
                    keccak256(abi.encodePacked(update.assets)),
                    keccak256(abi.encodePacked(update.prices)),
                    update.timestamp
                )
            )
        );
    }

    function checkPrices(PriceUpdate calldata update, bytes calldata signature) external view {
        if (update.assets.length != update.prices.length) revert LengthMismatch();
        if (update.timestamp > block.timestamp || block.timestamp - update.timestamp > MAX_PRICE_AGE) {
            revert StalePrices(update.timestamp);
        }
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hashPriceUpdate(update), signature);
        if (err != ECDSA.RecoverError.NoError || signer != priceSigner) revert InvalidPriceSignature();
    }

    /// @dev An ownerless registry could never rotate the guardian or change an allowlist again.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }
}
