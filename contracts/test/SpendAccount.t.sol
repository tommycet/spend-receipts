// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SpendAccount} from "../src/SpendAccount.sol";
import {MockUSDC}     from "../src/MockUSDC.sol";
import {MockVendor}   from "../src/MockVendor.sol";

/// @title SpendAccount — unit tests + full 6-step demo flow.
/// @notice These tests reproduce the brief's demo flow exactly so any
///         reviewer running `forge test` sees the contract behave like
///         the dashboard describes it.
contract SpendAccountTest is Test {
    SpendAccount internal acct;
    MockUSDC     internal usdc;
    MockVendor   internal vResearch;
    MockVendor   internal vImages;
    MockVendor   internal vOther;

    address internal owner  = address(0xA11CE);
    address internal agent  = address(0xB0B);

    uint256 internal constant TOPUP       = 20e6;   // $20
    uint256 internal constant CAP_RESEARCH = 10e6;  // $10 / wk
    uint256 internal constant CAP_IMAGES   = 5e6;   // $5  / wk
    uint256 internal constant CAP_OTHER    = 0;     // $0  / wk — nothing slips through

    // Recorded event watcher — assert that PaymentBlocked was emitted before the revert.
    event PaymentBlocked(
        address indexed vendor,
        uint256 amount,
        SpendAccount.Category indexed category,
        uint64 timestamp,
        string reason
    );

    function setUp() public {
        usdc       = new MockUSDC();
        acct       = new SpendAccount(usdc, owner, agent);
        vResearch  = new MockVendor(usdc, "Research API Co");
        vImages    = new MockVendor(usdc, "Stock Image Co");
        vOther     = new MockVendor(usdc, "Contractor");

        // Vendors approve the smart account up-front so refunds work.
        vResearch.approveSpender(address(acct));
        vImages.approveSpender(address(acct));
        vOther.approveSpender(address(acct));

        // Fund owner → owner approves → owner funds the smart account.
        usdc.mint(owner, 100e6);
        vm.startPrank(owner);
        usdc.approve(address(acct), type(uint256).max);
        acct.fund(TOPUP);
        // Set the demo caps.
        acct.setCaps(CAP_RESEARCH, CAP_IMAGES, CAP_OTHER);
        vm.stopPrank();
    }

    // ──────────────────────── role + setup sanity ──────────────────────────
    function test_SetupRolesAndBalance() public view {
        assertEq(acct.owner(), owner);
        assertEq(acct.agent(), agent);
        assertEq(acct.balance(), TOPUP);
        (uint256 r, uint256 i, uint256 o) = acct.getCaps();
        assertEq(r, CAP_RESEARCH);
        assertEq(i, CAP_IMAGES);
        assertEq(o, CAP_OTHER);
    }

    function test_DemoSeedMintsAndCaps() public {
        // Fresh account with no setup — verifies demoSeed in isolation.
        MockUSDC     usdc2       = new MockUSDC();
        SpendAccount acct2       = new SpendAccount(usdc2, owner, agent);
        vm.prank(owner);
        acct2.demoSeed(20e6, 10e6, 5e6, 0);
        assertEq(acct2.balance(), 20e6);
        (uint256 r, uint256 i, uint256 o) = acct2.getCaps();
        assertEq(r, 10e6);
        assertEq(i, 5e6);
        assertEq(o, 0);
    }

    function test_DemoSeedOnlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("not owner");
        acct.demoSeed(1, 1, 1, 1);
    }

    function test_OnlyOwnerCanSetCaps() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("not owner");
        acct.setCap(SpendAccount.Category.Research, 1e6);
    }

    function test_OnlyAgentCanExecute() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("not agent");
        acct.execute(address(vResearch), 1, SpendAccount.Category.Research);
    }

    // ─────────────────────────── accept path ────────────────────────────────
    function test_AgentPayUnderCap_Succeeds() public {
        vm.prank(agent);
        uint256 id = acct.execute(address(vResearch), 3e6, SpendAccount.Category.Research);

        SpendAccount.Receipt memory r = acct.getReceipt(id);
        assertEq(uint256(r.status), uint256(SpendAccount.Status.Accepted));
        assertEq(r.vendor, address(vResearch));
        assertEq(r.amount, 3e6);
        assertEq(uint256(r.category), uint256(SpendAccount.Category.Research));
        assertEq(usdc.balanceOf(address(vResearch)), 3e6);
        assertEq(acct.balance(), TOPUP - 3e6);
    }

    function test_TwoPaymentsWithinCaps() public {
        vm.startPrank(agent);
        acct.execute(address(vResearch), 3e6, SpendAccount.Category.Research);
        acct.execute(address(vImages),   4e6, SpendAccount.Category.Images);
        vm.stopPrank();

        (uint256 r, uint256 i,) = acct.getSpentThisWeek();
        assertEq(r, 3e6);
        assertEq(i, 4e6);
        assertEq(acct.balance(), TOPUP - 7e6);
    }

    // ─────────────────────────── reject path ────────────────────────────────
    function test_AgentPayOverCap_RevertsAndEmitsBlocked() public {
        // 8 USDC contractor — cap for Other is 0
        vm.expectEmit(true, true, true, true);
        emit PaymentBlocked(
            address(vOther),
            8e6,
            SpendAccount.Category.Other,
            uint64(block.timestamp),
            "cap-exceeded"
        );
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendAccount.CapExceeded.selector,
                SpendAccount.Category.Other,
                0,
                0,
                8e6
            )
        );
        acct.execute(address(vOther), 8e6, SpendAccount.Category.Other);
    }

    function test_OverCapDoesNotConsumeBudget() public {
        vm.prank(agent);
        try acct.execute(address(vOther), 8e6, SpendAccount.Category.Other) {
            fail("expected revert");
        } catch { }
        (, , uint256 other) = acct.getSpentThisWeek();
        assertEq(other, 0, "blocked payment must not consume budget");
        assertEq(acct.balance(), TOPUP, "no USDC should have moved on revert");
    }

    function test_PartialConsumptionStillEnforced() public {
        // Already spent 3 USDC on research. Try a 9 USDC research payment —
        // 3 + 9 > 10 cap → must revert.
        vm.prank(agent);
        acct.execute(address(vResearch), 3e6, SpendAccount.Category.Research);

        vm.prank(agent);
        vm.expectRevert();
        acct.execute(address(vResearch), 9e6, SpendAccount.Category.Research);

        // A 7 USDC payment would put us at exactly 10 — should succeed.
        vm.prank(agent);
        acct.execute(address(vResearch), 7e6, SpendAccount.Category.Research);

        (uint256 r,,) = acct.getSpentThisWeek();
        assertEq(r, 10e6);
    }

    // ──────────────────────────── refund path ───────────────────────────────
    function test_RefundReturnsUsdcAndRestoresCap() public {
        vm.prank(agent);
        uint256 id = acct.execute(address(vImages), 4e6, SpendAccount.Category.Images);
        assertEq(usdc.balanceOf(address(acct)), TOPUP - 4e6);
        assertEq(usdc.balanceOf(address(vImages)), 4e6);

        vm.prank(owner);
        acct.refund(id);

        SpendAccount.Receipt memory r = acct.getReceipt(id);
        assertEq(uint256(r.status), uint256(SpendAccount.Status.Refunded));
        assertEq(usdc.balanceOf(address(acct)), TOPUP);
        assertEq(usdc.balanceOf(address(vImages)), 0);

        (, uint256 i,) = acct.getSpentThisWeek();
        assertEq(i, 0, "refund must restore category budget");
    }

    function test_RefundOnlyOwner() public {
        vm.prank(agent);
        uint256 id = acct.execute(address(vImages), 4e6, SpendAccount.Category.Images);

        vm.prank(address(0xDEAD));
        vm.expectRevert("not owner");
        acct.refund(id);
    }

    function test_DoubleRefundReverts() public {
        vm.prank(agent);
        uint256 id = acct.execute(address(vImages), 4e6, SpendAccount.Category.Images);

        vm.startPrank(owner);
        acct.refund(id);
        vm.expectRevert("not refundable");
        acct.refund(id);
        vm.stopPrank();
    }

    function test_TotalsMatchReceipts() public {
        vm.startPrank(agent);
        acct.execute(address(vResearch), 3e6, SpendAccount.Category.Research);
        acct.execute(address(vImages),   4e6, SpendAccount.Category.Images);
        vm.stopPrank();

        // 8 USDC contractor attempt reverts — no receipt, no contribution to totals.
        vm.prank(agent);
        try acct.execute(address(vOther), 8e6, SpendAccount.Category.Other) {
            fail("expected revert");
        } catch { }

        // Refund the $4 image receipt.
        vm.prank(owner);
        acct.refund(1);

        (uint256 spent, uint256 refunded, uint256 blocked) = acct.totals();
        assertEq(spent,    3e6, "spent = $3 research");
        assertEq(refunded, 4e6, "refunded = $4 image");
        assertEq(blocked,  0,   "blocked amounts do not produce a Receipt");
    }

    // ─────────────────── full brief demo flow, end-to-end ───────────────────
    /// @notice Reproduces all six steps of the brief's Demo Scope in one test:
    ///         1) fund, 2) set caps, 3) agent fires 3 payments (one over cap),
    ///         4) feed reflects state, 5) refund, 6) end-state totals.
    function test_DemoFlow_SixSteps() public {
        // Step 1 — funded in setUp
        assertEq(acct.balance(), TOPUP);

        // Step 2 — caps set in setUp
        (uint256 r, uint256 i, uint256 o) = acct.getCaps();
        assertEq(r + i + o, 15e6);

        // Step 3 — agent fires three payments
        vm.startPrank(agent);
        uint256 idResearch = acct.execute(address(vResearch), 3e6, SpendAccount.Category.Research);
        uint256 idImages   = acct.execute(address(vImages),   4e6, SpendAccount.Category.Images);
        // Over-cap attempt — must revert at the contract level.
        vm.expectRevert();
        acct.execute(address(vOther), 8e6, SpendAccount.Category.Other);
        vm.stopPrank();

        // Step 4 — feed has the two accepted receipts
        assertEq(acct.receiptCount(), 2);
        assertEq(uint256(acct.getReceipt(idResearch).status), uint256(SpendAccount.Status.Accepted));
        assertEq(uint256(acct.getReceipt(idImages).status),   uint256(SpendAccount.Status.Accepted));

        // Step 5 — refund the $4 receipt
        vm.prank(owner);
        acct.refund(idImages);
        assertEq(uint256(acct.getReceipt(idImages).status), uint256(SpendAccount.Status.Refunded));
        assertEq(acct.balance(), TOPUP - 3e6);

        // Step 6 — end state totals
        (uint256 spent, uint256 refunded, uint256 blocked) = acct.totals();
        assertEq(spent,    3e6);
        assertEq(refunded, 4e6);
        assertEq(blocked,  0);
        // Plus the 8 USDC blocked attempt is recorded as a PaymentBlocked event
        // off-chain — the dashboard reads the event log.
    }

    // ─────────────────────────── fuzz / invariants ──────────────────────────
    /// @notice Fuzz: any series of accept-or-reject attempts leaves the
    ///         invariant "balance + sum(receipt amounts) == initial balance"
    ///         intact.
    function testFuzz_BalanceInvariant(uint64[8] memory amounts, uint8[8] memory cats) public {
        uint256 startBal = acct.balance();
        uint256 acceptedSum;
        for (uint256 k = 0; k < 8; k++) {
            uint256 amt = (uint256(amounts[k]) % 4e6) + 1;          // 1..4 USDC
            SpendAccount.Category cat = SpendAccount.Category(cats[k] % 3);
            address vendor = cat == SpendAccount.Category.Research
                ? address(vResearch)
                : cat == SpendAccount.Category.Images ? address(vImages) : address(vOther);
            vm.prank(agent);
            try acct.execute(vendor, amt, cat) {
                acceptedSum += amt;
            } catch { }
        }
        // Account balance must equal initial minus everything that was
        // accepted. (Refunds aren't called in this fuzz.)
        assertEq(acct.balance() + acceptedSum, startBal);
    }
}
