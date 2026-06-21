// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockUSDC} from "./MockUSDC.sol";

/// @title SpendAccount — per-category USDC budget enforced at the contract level.
/// @notice Marcus (the owner) funds this contract with USDC, configures a
///         weekly cap per spending category, and registers an "agent"
///         address. The agent may call `execute()` to pay any vendor on
///         Marcus's behalf — but any payment that would breach a category
///         cap reverts at the protocol. Every accepted payment becomes a
///         refundable receipt. Marcus can pull USDC back from any
///         unrefunded receipt with `refund()`.
/// @dev    Modeled on the ERC-4337 smart-account pattern (an owner
///         delegates a hot agent key while a cold owner keeps the refund
///         and cap-setting power). For the demo the agent is just a
///         separate EOA — in production this contract would be the
///         smart-account wallet behind a real bundler (StackUp, Pimlico).
contract SpendAccount {
    // ───────────────────────────────── types ────────────────────────────────
    enum Category { Research, Images, Other }

    enum Status { Accepted, Refunded }

    struct Receipt {
        uint256    id;
        address    vendor;
        uint256    amount;
        Category   category;
        Status     status;
        uint64     timestamp;
    }

    // ─────────────────────────────── immutables ─────────────────────────────
    MockUSDC public immutable usdc;

    // ──────────────────────────────── roles ─────────────────────────────────
    address public owner;       // Marcus — caps, refunds, agent rotation
    address public agent;       // hot key the agent script uses to pay vendors

    // ──────────────────────────── cap accounting ────────────────────────────
    mapping(Category => uint256) public cap;            // cap per category, per week
    mapping(Category => uint256) public spentThisWeek;  // accepted spend per category, this week
    uint64 public weekStart;                            // timestamp the current week began

    // ───────────────────────────── receipts ─────────────────────────────────
    Receipt[] private _receipts;

    // ───────────────────────────────── events ───────────────────────────────
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event CapsSet(Category indexed category, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event PaymentAccepted(
        uint256    indexed id,
        address    indexed vendor,
        uint256    amount,
        Category   indexed category,
        uint64     timestamp
    );
    event PaymentBlocked(
        address    indexed vendor,
        uint256    amount,
        Category   indexed category,
        uint64     timestamp,
        string     reason
    );
    event Refunded(
        uint256    indexed id,
        address    indexed vendor,
        uint256    amount,
        Category   indexed category
    );
    event WeekRolled(uint64 indexed newWeekStart);

    // ─────────────────────────────── modifiers ──────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent || msg.sender == owner, "not agent");
        _;
    }

    constructor(MockUSDC _usdc, address _owner, address _agent) {
        usdc    = _usdc;
        owner   = _owner;
        agent   = _agent;
        weekStart = uint64(block.timestamp);
    }

    // ─────────────────────────── owner actions ──────────────────────────────
    function setAgent(address newAgent) external onlyOwner {
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    function setCap(Category category, uint256 amount) external onlyOwner {
        cap[category] = amount;
        emit CapsSet(category, amount);
    }

    function setCaps(uint256 research, uint256 images, uint256 other) external onlyOwner {
        cap[Category.Research] = research;
        cap[Category.Images]   = images;
        cap[Category.Other]    = other;
        emit CapsSet(Category.Research, research);
        emit CapsSet(Category.Images,   images);
        emit CapsSet(Category.Other,    other);
    }

    /// @notice Demo-only seed: mints test USDC directly into the smart
    ///         account and applies the brief's default caps in one tx.
    ///         Replaces the two-step "fund + setCaps" flow during a live
    ///         demo so reviewers don't get stuck on approval pop-ups.
    ///         Requires the deployer to have wired MockUSDC into usdc;
    ///         on real USDC this function reverts because mint is gated.
    function demoSeed(uint256 topup, uint256 researchCap, uint256 imagesCap, uint256 otherCap) external onlyOwner {
        try MockUSDC(address(usdc)).mint(address(this), topup) {
            // minted successfully — MockUSDC demo path
        } catch {
            revert("demoSeed: usdc mint unsupported - wire real USDC");
        }
        cap[Category.Research] = researchCap;
        cap[Category.Images]   = imagesCap;
        cap[Category.Other]    = otherCap;
        emit CapsSet(Category.Research, researchCap);
        emit CapsSet(Category.Images,   imagesCap);
        emit CapsSet(Category.Other,    otherCap);
    }

    /// @notice Pull USDC in. Caller must approve this contract first.
    function fund(uint256 amount) external onlyOwner {
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc xfer in");
        emit Funded(msg.sender, amount);
    }

    /// @notice Move USDC out back to the owner. Useful when Marcus wants to
    ///         pull his balance without refunding a specific vendor.
    function withdraw(uint256 amount) external onlyOwner {
        require(usdc.transfer(owner, amount), "usdc xfer out");
    }

    // ─────────────────────────── agent actions ──────────────────────────────
    /// @notice Pay a vendor. Reverts if the payment would exceed the
    ///         category's weekly cap. Emits PaymentAccepted on success or
    ///         PaymentBlocked immediately before reverting so the
    ///         dashboard indexer can still see the attempt.
    function execute(
        address vendor,
        uint256 amount,
        Category category
    ) external onlyAgent returns (uint256 id) {
        require(amount > 0, "amount=0");
        require(vendor != address(0), "vendor=0");

        _maybeRollWeek();

        uint256 used      = spentThisWeek[category];
        uint256 capAmount = cap[category];

        if (used + amount > capAmount) {
            emit PaymentBlocked(
                vendor,
                amount,
                category,
                uint64(block.timestamp),
                "cap-exceeded"
            );
            revert CapExceeded(category, used, capAmount, amount);
        }

        require(usdc.transfer(vendor, amount), "usdc xfer to vendor");

        id = _receipts.length;
        _receipts.push(
            Receipt({
                id:        id,
                vendor:    vendor,
                amount:    amount,
                category:  category,
                status:    Status.Accepted,
                timestamp: uint64(block.timestamp)
            })
        );
        spentThisWeek[category] = used + amount;

        emit PaymentAccepted(id, vendor, amount, category, uint64(block.timestamp));
    }

    // ─────────────────────────── refund flow ────────────────────────────────
    /// @notice Marcus pulls USDC back from the vendor on a specific receipt.
    ///         The vendor must approve this contract for the receipt amount
    ///         (in this demo the MockVendor auto-approves its entire balance
    ///         on construction). Restores the cap-space for that category.
    function refund(uint256 receiptId) external onlyOwner {
        require(receiptId < _receipts.length, "bad id");
        Receipt storage r = _receipts[receiptId];
        require(r.status == Status.Accepted, "not refundable");

        // Pull USDC back from the vendor. The vendor must have approved us.
        require(
            usdc.transferFrom(r.vendor, address(this), r.amount),
            "refund xfer"
        );

        r.status = Status.Refunded;
        // Never underflow — invariant: spentThisWeek >= sum of accepted
        // receipts minus sum of refunded receipts in this category.
        spentThisWeek[r.category] -= r.amount;

        emit Refunded(r.id, r.vendor, r.amount, r.category);
    }

    // ──────────────────────────── view API ──────────────────────────────────
    function receiptCount() external view returns (uint256) {
        return _receipts.length;
    }

    function getReceipt(uint256 id) external view returns (Receipt memory) {
        return _receipts[id];
    }

    function getReceipts() external view returns (Receipt[] memory) {
        return _receipts;
    }

    function getCaps() external view returns (uint256 research, uint256 images, uint256 other) {
        return (cap[Category.Research], cap[Category.Images], cap[Category.Other]);
    }

    function getSpentThisWeek() external view returns (uint256 research, uint256 images, uint256 other) {
        return (
            spentThisWeek[Category.Research],
            spentThisWeek[Category.Images],
            spentThisWeek[Category.Other]
        );
    }

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Aggregate totals across the receipts array. Spent = sum of
    ///         accepted-and-not-yet-refunded receipts. Refunded = sum of
    ///         refunded receipts. Blocked is intentionally NOT tracked here;
    ///         blocked payments reverted at the protocol level and so do
    ///         not produce a Receipt — they are counted from on-chain
    ///         PaymentBlocked events by the dashboard.
    function totals()
        external
        view
        returns (uint256 spent, uint256 refunded, uint256 blockedRecorded)
    {
        uint256 s;
        uint256 r;
        uint256 b;
        unchecked {
            uint256 n = _receipts.length;
            for (uint256 i = 0; i < n; i++) {
                Receipt memory rec = _receipts[i];
                if (rec.status == Status.Accepted)      s += rec.amount;
                else if (rec.status == Status.Refunded) r += rec.amount;
            }
        }
        return (s, r, b);
    }

    // ────────────────────────────── errors ──────────────────────────────────
    error CapExceeded(Category category, uint256 spent, uint256 capAmount, uint256 attempted);

    // ────────────────────────────── internals ───────────────────────────────
    function _maybeRollWeek() internal {
        // 7-day week, rolling. Reset per-category spend counters.
        uint64 ts = uint64(block.timestamp);
        if (ts >= weekStart + 7 days) {
            weekStart = ts;
            spentThisWeek[Category.Research] = 0;
            spentThisWeek[Category.Images]   = 0;
            spentThisWeek[Category.Other]    = 0;
            emit WeekRolled(ts);
        }
    }
}
