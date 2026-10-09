// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FolioVault} from "../../src/FolioVault.sol";

/// @dev Test token with configurable decimals and open minting.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes 1% of every transfer, so the receiver gets less than was sent.
contract MockFeeERC20 is MockERC20 {
    address public constant FEE_SINK = address(0xFEE);

    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = value / 100;
        super._update(from, FEE_SINK, fee);
        super._update(from, to, value - fee);
    }
}

/// @dev Calls back into the vault's seed() during the transfer into it, to test the reentrancy guard.
contract MockReentrantERC20 is MockERC20 {
    FolioVault public target;
    bool public armed;
    bool public innerOk;

    constructor() MockERC20("Evil", "EVL", 18) {}

    function arm(FolioVault v) external {
        target = v;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && to == address(target) && from != address(0)) {
            armed = false;
            _mint(address(this), 100e18);
            _approve(address(this), address(target), 100e18);
            (bool ok,) = address(target).call(abi.encodeCall(FolioVault.seed, (100e18)));
            innerOk = ok;
        }
    }
}

/// @dev Can be paused by its issuer, like real stock tokens: every transfer then reverts.
contract MockPausableERC20 is MockERC20 {
    bool public paused;

    error TokenPaused();

    constructor() MockERC20("Pausable Stock", "PSTK", 18) {}

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        super._update(from, to, value);
    }
}
