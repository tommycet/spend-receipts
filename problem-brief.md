# Web3 Problem Brief: Three Candidates + One Pick

## Candidate 1 — AI agent spend receipts with per-action authorization

**Who has the problem.** *Marcus, owner of a 5-person marketing agency*, who uses an AI agent to handle routine procurement — API credits, stock photos, contractor invoices. He gives the agent a weekly USDC budget and worries about silent overspend.

**Workflow.** Marcus sets per-category caps ($20/wk on research APIs, $15/wk on stock images, $0 elsewhere). The agent makes x402 calls to multiple vendors. Each payment produces an on-chain receipt that flows into a dashboard with vendor, amount, category, and a one-click refund. The smart account rejects any call over a cap.

**Why current solutions fail.** Stripe billing is per-vendor; OpenAI/Anthropic "AI spend" dashboards cover only that vendor. No cross-vendor, programmatically enforceable, refundable trail exists. Once the agent has your card number, you trust the agent and the AI platform.

**Web3 angle.** x402 gives every internet endpoint a native payment rail (AWS enabled it for CloudFront via WAF on Jun 19, 2026). ERC-4337 session keys + smart accounts enforce per-category caps *in code*. On-chain receipts are independently verifiable without trusting the agent or any AI vendor.

**Comparable projects.** AgentMesh (P2P mesh, ETHGlobal Open Agents 2026), Clawork (agent bounty marketplace, HackMoney 2026), GroundTruth (Cannes 2026). None focus on spend-oversight.

**Hackathon-feasibility verdict.** HIGH. Next.js dashboard + x402 listener on Base Sepolia + ERC-4337 cap contract. Demo: top up $20 → agent buys 3 things → dashboard shows line items → owner kills one with a click.

---

## Candidate 2 — Group expense splitting in stablecoins (Splitwise / Venmo replacement)

**Who has the problem.** A group of 4–8 roommates or friends on a multi-day trip.

**Workflow.** Anyone logs an expense in a shared GroupVault; the contract computes optimal settlement paths; each person settles their debt in USDC directly to creditors — no platform custody.

**Why current solutions fail.** Splitwise owns your data; Venmo refuses cross-border; both require downloads, KYC, accounts. No on-chain receipt for a tax return or expense report.

**Web3 angle.** Non-custodial USDC settlement; on-chain receipts that survive the platform; cross-border by default; no lock-in.

**Comparable projects.** SplitChain, StableSplit, ChainSplit, Chill'Split, CapyTab — five shipped at 2025–26 hackathons. **Market is saturated.**

**Hackathon-feasibility verdict.** VERY HIGH technically; LOW strategically — judges have seen this many times.

---

## Candidate 3 — Rental-deposit escrow with photo-verified AI dispute

**Who has the problem.** *Priya, 27, software engineer renting a $2,400/mo apartment* — her landlord holds her $2,400 deposit in a personal account, unilaterally deducts "damages" at move-out, and her only recourse is small-claims court.

**Workflow.** Both parties upload move-in photos to IPFS at lease start; on move-out, both upload move-out photos; Gemini compares them and produces a sealed damage estimate; parties either agree (auto-release) or open sealed-bid on-chain arbitration with a hard deadline (full refund if unresolved).

**Why current solutions fail.** The deposit sits in the landlord's bank account; the tenant has no leverage; disputes drag for months; no neutral record of property condition.

**Web3 angle.** The deposit is locked in a program-derived account that **neither party — nor the developer — can unlock unilaterally**. The on-chain photo record is tamper-proof. Sealed-bid arbitration prevents retaliation. The whole flow executes without courts.

**Comparable projects.** DepositGuard (hackathon, Solana + Gemini), FairBNB (hackathon), RentLock (early startup, low traction), OpenEscrow (hackathon). Few consumer-grade competitors.

**Hackathon-feasibility verdict.** MEDIUM-HIGH. Anchor program + IPFS + Gemini + sealed-bid dispute contract. Demo in 5 minutes.

---

## Recommendation: Candidate 1 — AI agent spend receipts

**Pick this one.** The agent economy is exploding — x402 volume crossed 100M cumulative Base transactions by Q1 2026, and AWS enabled it for CloudFront two days ago — but **no consumer-grade spend-oversight app exists yet**. Every agent-economy hackathon project so far optimizes *agent capability* (mesh, marketplace, oracle); none optimizes the user's ability to audit and cap what the agent does.

The web3 angle is uniquely defensible: cross-vendor, independently verifiable, programmatically enforceable per-category caps with refundable receipts are **impossible without on-chain settlement**. Stripe cannot bind a vendor-side script to a category; a smart account can.

The named user (Marcus) and workflow (weekly $50 USDC budget, agent buys across 3 vendors, dashboard with one-click refund) are spec-able in an afternoon. The demo story is crisp: top up → agent buys → audit → refund. A designer can write the 1-page brief from this; a programmer can build it in roughly 6–8 hours on Base Sepolia + AgentKit + a 4337 bundler.
