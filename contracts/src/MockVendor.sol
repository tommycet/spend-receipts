// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "./MockUSDC.sol";

/// @title MockVendor — stand-in for an x402 vendor.
/// @notice Receives USDC when the agent pays for an item; exposes `refund()`
///         so the smart account can pull the USDC back when Marcus hits
///         "Refund" on the dashboard. In production this is replaced by
///         the actual x402 vendor endpoint.
contract MockVendor {
    MockUSDC public immutable usdc;
    string  public name;

    constructor(MockUSDC _usdc, string memory _name) {
        usdc = _usdc;
        name = _name;
    }

    /// @notice Pre-approve the SpendAccount to pull USDC back for refunds.
    ///         In production each vendor would approve on receiving payment.
    function approveSpender(address spender) external {
        usdc.approve(spender, type(uint256).max);
    }

    /// @notice Pull USDC back to the smart account on refund.
    function refund(address to, uint256 amount) external returns (bool ok) {
        ok = usdc.transfer(to, amount);
    }
}
