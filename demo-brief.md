# AI Agent Spend Receipts — Hackathon Brief

**Track:** ETHGlobal (Agent Economy) | **Stack:** Base Sepolia, ERC-4337, x402, Next.js | **Demo:** 5 min

## 1. Problem

*Marcus, owner of a 5-person marketing agency,* gives an AI agent a weekly USDC budget for research APIs, stock images, and contractor invoices. He can't cap per-category spend, can't see a cross-vendor receipt trail, and can't claw money back. Stripe and AI-vendor dashboards each cover one silo; none covers the agent's total spend.

## 2. Proposed Solution

An **ERC-4337 smart account** holds Marcus's USDC and enforces per-category caps in code; an **x402 listener** logs every agent payment as an on-chain receipt in a refundable dashboard.

**Why web3, not web2.** Stripe can't bind a vendor-side script to a category, so per-category caps can't be enforced cross-vendor. A smart account can: any x402 payment over a cap reverts at the protocol — no trust in agent or vendor, no platform custody. Refunds are an on-chain pull; receipts are independently verifiable on Basescan.

## 3. Minimal Demo Scope

1. **Connect & fund** — Marcus connects MetaMask and tops up the smart account with $20 USDC.
2. **Set caps** — On Setup, Marcus configures three caps: Research $10/wk, Images $5/wk, Other $0/wk.
3. **Agent runs** — Agent fires three x402 payments: $3 research-API (under cap), $4 stock-image (under cap), $8 contractor-invoice (over cap → smart account rejects).
4. **Live feed** — Dashboard lists every attempt: vendor, amount, category, timestamp, Basescan link, Refund button (disabled on rejected row).
5. **Refund one** — Marcus clicks Refund on the $4 receipt; smart account pulls USDC back; row status flips to "Refunded"; freed budget returns to the cap.
6. **End state** — Totals: Spent $3, Refunded $4 (returned), Blocked $8. Each links to the Basescan tx.

## 4. Key UI Screens

- **Setup** — Wallet, smart-account USDC balance, three category-cap inputs (number + slider), Save (confirms caps on-chain).
- **Live Activity** — Reverse-chronological receipt feed; per-row vendor, amount, category badge (green/amber/red vs cap), tx-hash link, Refund action; sticky header with running Spent / Refunded / Blocked.
- **Summary** — End-of-demo totals, Basescan link per row, one-click "Export CSV".

## 5. Success Criteria

On a fresh Base Sepolia wallet:

- An agent payment above a cap is **reverted at the smart-account contract level** (Basescan shows a failed `executeUserOp` with cap-revert reason).
- Every accepted payment appears in Live Activity within 2 seconds, with vendor, amount, category, clickable tx-hash.
- Refund returns USDC to Marcus's smart account within 10 seconds; row status updates without page reload.

## 6. Out of Scope

Multi-user accounts; fiat on-ramp (USDC enters via MetaMask); non-x402 vendors (no Stripe/ACH/PayPal); mobile native (responsive web only); cross-session persistence; agent-prompt transparency (we audit spend, not thinking); gas refund on rejected calls.
