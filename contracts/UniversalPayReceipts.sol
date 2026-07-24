// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  UniversalPayReceipts
/// @notice On-chain payment receipts for Universal Pay (UXmaxx hackathon).
///         Pulls an ERC-20 payment from the payer and forwards it to the
///         recipient in a single call, emitting an indexed Receipt event —
///         a verifiable on-chain record of every Universal Pay payment on
///         Arbitrum One. Holds no funds, has no owner, cannot be upgraded.
interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract UniversalPayReceipts {
    event Receipt(
        address indexed payer,
        address indexed to,
        address indexed token,
        uint256 amount,
        bytes32 note
    );

    uint256 public receiptCount;

    /// @param token  ERC-20 being paid (e.g. USDC on Arbitrum One)
    /// @param to     recipient of the payment
    /// @param amount token amount in the token's smallest unit
    /// @param note   free-form reference (request id, order label, etc.)
    function payWithReceipt(address token, address to, uint256 amount, bytes32 note) external {
        require(to != address(0), "UniversalPay: bad recipient");
        require(amount > 0, "UniversalPay: bad amount");
        require(IERC20(token).transferFrom(msg.sender, to, amount), "UniversalPay: transfer failed");
        unchecked {
            receiptCount++;
        }
        emit Receipt(msg.sender, to, token, amount, note);
    }
}
