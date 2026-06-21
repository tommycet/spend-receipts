'use client'

import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi'
import { useState, useEffect, useMemo } from 'react'
import { useDeployment, SPEND_ACCOUNT_ABI, formatUsdc, CATEGORIES, type Deployment, explorerTx } from '@/lib/contract'

interface ReceiptRow {
  id:         bigint
  vendor:     `0x${string}`
  amount:     bigint
  category:   number
  status:     number  // 0=Accepted, 1=Refunded
  timestamp:  bigint
}

interface BlockedRow {
  id:         string  // synthetic, since the tx reverted (no on-chain id)
  vendor:     `0x${string}`
  amount:     bigint
  category:   number
  timestamp:  bigint
  txHash:     `0x${string}`
  reason:     string
}

type FeedRow =
  | { kind: 'accepted'; data: ReceiptRow }
  | { kind: 'blocked';  data: BlockedRow }

export default function ActivityPage() {
  const { isConnected } = useAccount()
  const chainId = useChainId() ?? 0
  const { deployment, loaded, isZero } = useDeployment()

  if (!loaded) return <div className="state-msg">LOADING…</div>
  if (isZero)  return <NoDeployment />

  return (
    <div className="space-y-6">
      <Header />
      <Totals deployment={deployment} />
      <PaymentActions deployment={deployment} />
      <ReceiptFeed deployment={deployment} chainId={chainId} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="label mono text-[var(--color-emerald)]">02</span>
        <h1 className="text-xl font-medium tracking-tight">Live Activity</h1>
      </div>
      <p className="text-sm text-[var(--color-fg-1)] mt-1">
        Three x402 payments from the agent. Each appears here within one block.
      </p>
      <hr className="hr" />
    </div>
  )
}

// ─────────────────────────── totals strip ─────────────────────────────
function Totals({ deployment }: { deployment: Deployment }) {
  const { data: totals } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'totals',
  })

  const blockedEvents = useWatchBlockedEvents(deployment)

  const spent     = totals ? formatUsdc(totals[0] as bigint) : '0.00'
  const refunded  = totals ? formatUsdc(totals[1] as bigint) : '0.00'
  const blockedOnChain = totals ? formatUsdc(totals[2] as bigint) : '0.00'
  const blocked   = blockedEvents && blockedEvents.length > 0
    ? formatUsdc(blockedEvents.reduce((s, e) => s + e.amount, 0n))
    : blockedOnChain

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard label="SPENT"     value={spent}    accent="emerald" hint="USDC moved out of the smart account." />
      <StatCard label="REFUNDED"  value={refunded} accent="amber"   hint="USDC pulled back from vendors." />
      <StatCard label="BLOCKED"   value={blocked}  accent="rose"    hint="Cap-rejected. Reverted at the protocol." />
    </div>
  )
}

function StatCard({ label, value, accent, hint }: { label: string; value: string; accent: 'emerald' | 'amber' | 'rose'; hint: string }) {
  const accentColor =
    accent === 'emerald' ? 'text-[var(--color-emerald-bright)]' :
    accent === 'amber'   ? 'text-[var(--color-amber)]' :
                           'text-[var(--color-rose)]'

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className={`badge badge-${accent}`}>{accent.toUpperCase()}</span>
      </div>
      <div className={`mt-2 num text-2xl ${accentColor}`}>${value}</div>
      <p className="text-xs text-[var(--color-fg-2)] mt-1.5 font-mono leading-snug">{hint}</p>
    </div>
  )
}

// ─────────────────────────── payment actions ─────────────────────────
function PaymentActions({ deployment }: { deployment: Deployment }) {
  const { isConnected } = useAccount()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })
  const [pendingVendor, setPendingVendor] = useState<string | null>(null)

  function pay(vendorKey: 'research' | 'images' | 'other', amount: number, categoryId: number) {
    const vendor =
      vendorKey === 'research' ? deployment.vendorResearch :
      vendorKey === 'images'   ? deployment.vendorImages :
                                  deployment.vendorOther
    setPendingVendor(vendorKey)
    writeContract({
      address: deployment.spendAccount,
      abi: SPEND_ACCOUNT_ABI,
      functionName: 'execute',
      args: [vendor, BigInt(amount * 1e6), categoryId],
    })
  }

  useEffect(() => {
    if (isConfirmed) {
      const t = setTimeout(() => { setPendingVendor(null); reset() }, 1500)
      return () => clearTimeout(t)
    }
    if (error) {
      const t = setTimeout(() => { setPendingVendor(null); reset() }, 3000)
      return () => clearTimeout(t)
    }
  }, [isConfirmed, error, reset])

  const busy = isPending || isMining

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="dot dot-idle" />
          <span className="label">AGENT PAYMENTS / SIMULATED X402</span>
        </div>
        <span className="label mono">STEP 03</span>
      </div>
      <p className="text-sm text-[var(--color-fg-1)] mb-4">
        The agent fires three x402-style payments against the smart account. The third exceeds the Other=0 cap and must
        revert at the contract level.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PaymentButton
          vendorKey="research"
          vendorName="Research API Co"
          amount={3}
          category="Research"
          tone="emerald"
          onClick={() => pay('research', 3, 0)}
          disabled={!isConnected || busy}
          busy={pendingVendor === 'research' && busy}
          done={pendingVendor === 'research' && isConfirmed}
        />
        <PaymentButton
          vendorKey="images"
          vendorName="Stock Image Co"
          amount={4}
          category="Images"
          tone="emerald"
          onClick={() => pay('images', 4, 1)}
          disabled={!isConnected || busy}
          busy={pendingVendor === 'images' && busy}
          done={pendingVendor === 'images' && isConfirmed}
        />
        <PaymentButton
          vendorKey="other"
          vendorName="Contractor"
          amount={8}
          category="Other"
          tone="rose"
          onClick={() => pay('other', 8, 2)}
          disabled={!isConnected || busy}
          busy={pendingVendor === 'other' && busy}
          done={pendingVendor === 'other' && isConfirmed}
          blocked={pendingVendor === 'other' && !!error}
        />
      </div>

      {error && (
        <div className="mt-3 panel-inner p-3">
          <span className="label text-[var(--color-rose)]">TX FAILED (expected for over-cap)</span>
          <p className="text-xs font-mono mt-1 text-[var(--color-fg-1)] break-all">{shortError(error.message)}</p>
          {hash && (
            <p className="text-xs font-mono mt-1 text-[var(--color-fg-2)]">
              Failed tx still minted on-chain. See the BLOCKED row below.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PaymentButton({
  vendorKey, vendorName, amount, category, tone, onClick, disabled, busy, done, blocked,
}: {
  vendorKey: string
  vendorName: string
  amount: number
  category: string
  tone: 'emerald' | 'rose'
  onClick: () => void
  disabled: boolean
  busy: boolean
  done: boolean
  blocked?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`panel-inner p-4 text-left transition-colors hover:border-[var(--color-emerald)] disabled:opacity-50 disabled:cursor-not-allowed ${tone === 'rose' ? 'hover:border-[var(--color-rose)]' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`badge badge-${tone}`}>{category.toUpperCase()}</span>
        <span className="num text-[var(--color-fg-2)] text-sm">${amount}.00</span>
      </div>
      <div className="text-sm font-mono text-[var(--color-fg-0)]">{vendorName}</div>
      <div className="text-[10px] text-[var(--color-fg-2)] font-mono uppercase tracking-widest mt-2">
        {busy ? 'BROADCASTING…' : done ? 'CONFIRMED' : blocked ? 'BLOCKED / CAP-EXCEEDED' : 'CLICK TO FIRE X402'}
      </div>
    </button>
  )
}

// ─────────────────────────── feed ─────────────────────────────────────
function ReceiptFeed({ deployment, chainId }: { deployment: Deployment; chainId: number }) {
  const { data: count } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'receiptCount',
  })

  const rows = useReceipts(deployment, count ? Number(count) : 0)
  const blocked = useWatchBlockedEvents(deployment)

  const feed = useMemo<FeedRow[]>(() => {
    const accepted: FeedRow[] = rows.map((r) => ({ kind: 'accepted', data: r }))
    const bl: FeedRow[] = blocked.map((b) => ({ kind: 'blocked', data: b }))
    accepted.sort((a, b) => {
      if (a.kind !== 'accepted' || b.kind !== 'accepted') return 0
      return Number(b.data.id - a.data.id)
    })
    bl.sort((a, b) => {
      if (a.kind !== 'blocked' || b.kind !== 'blocked') return 0
      return Number(b.data.timestamp - a.data.timestamp)
    })
    return [...bl, ...accepted]
  }, [rows, blocked])

  return (
    <div className="panel">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <span className="dot" />
          <span className="label">RECEIPT FEED</span>
        </div>
        <span className="label mono">{feed.length} ROWS</span>
      </div>

      {feed.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <span className="state-msg">NO PAYMENTS YET</span>
          <p className="text-sm text-[var(--color-fg-2)] mt-2">
            Fire one of the three agent payments above to see a row appear.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-fg-2)] font-mono text-[10px] uppercase tracking-widest border-b border-[var(--color-line)]">
              <th className="px-5 py-2.5 font-normal">STATUS</th>
              <th className="px-5 py-2.5 font-normal">VENDOR</th>
              <th className="px-5 py-2.5 font-normal">AMOUNT</th>
              <th className="px-5 py-2.5 font-normal">CATEGORY</th>
              <th className="px-5 py-2.5 font-normal">TX</th>
              <th className="px-5 py-2.5 font-normal">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((row, i) => (
              <FeedRowView key={row.kind === 'accepted' ? `a-${row.data.id}` : `b-${row.data.id}`} row={row} chainId={chainId} deployment={deployment} index={i} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FeedRowView({ row, chainId, deployment, index }: { row: FeedRow; chainId: number; deployment: Deployment; index: number }) {
  if (row.kind === 'blocked') {
    return <BlockedRowView row={row.data} chainId={chainId} index={index} />
  }
  return <AcceptedRowView row={row.data} chainId={chainId} deployment={deployment} index={index} />
}

function AcceptedRowView({ row, chainId, deployment, index }: { row: ReceiptRow; chainId: number; deployment: Deployment; index: number }) {
  const { isConnected } = useAccount()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  const status = row.status === 1 ? 'REFUNDED' : 'ACCEPTED'
  const isRefundable = row.status === 0

  return (
    <tr className={`border-b border-[var(--color-line)] hover:bg-[var(--color-bg-2)] transition-colors ${index % 2 === 0 ? '' : 'bg-[rgba(255,255,255,0.01)]'}`}>
      <td className="px-5 py-3">
        <span className={`badge ${row.status === 1 ? 'badge-amber' : 'badge-emerald'}`}>{status}</span>
      </td>
      <td className="px-5 py-3 font-mono text-xs text-[var(--color-fg-1)]">
        {shortAddr(row.vendor)}
      </td>
      <td className="px-5 py-3 num text-[var(--color-fg-0)]">
        ${formatUsdc(row.amount)}
      </td>
      <td className="px-5 py-3">
        <CategoryBadge id={row.category} />
      </td>
      <td className="px-5 py-3 font-mono text-xs">
        <span className="text-[var(--color-fg-2)]">#{String(row.id)}</span>
      </td>
      <td className="px-5 py-3">
        {isRefundable ? (
          <button
            className="btn btn-danger"
            disabled={!isConnected || isPending || isMining}
            onClick={() => writeContract({
              address: deployment.spendAccount,
              abi: SPEND_ACCOUNT_ABI,
              functionName: 'refund',
              args: [row.id],
            })}
          >
            {isPending ? 'CONFIRM…' : isMining ? 'MINING…' : isConfirmed ? 'REFUNDED' : 'REFUND'}
          </button>
        ) : (
          <span className="text-xs font-mono text-[var(--color-fg-2)]">—</span>
        )}
        {error && <p className="text-[10px] text-[var(--color-rose)] font-mono mt-1">{shortError(error.message)}</p>}
      </td>
    </tr>
  )
}

function BlockedRowView({ row, chainId, index }: { row: BlockedRow; chainId: number; index: number }) {
  return (
    <tr className={`border-b border-[var(--color-line)] hover:bg-[var(--color-bg-2)] transition-colors ${index % 2 === 0 ? '' : 'bg-[rgba(255,255,255,0.01)]'}`}>
      <td className="px-5 py-3">
        <span className="badge badge-rose">BLOCKED</span>
      </td>
      <td className="px-5 py-3 font-mono text-xs text-[var(--color-fg-1)]">
        {shortAddr(row.vendor)}
      </td>
      <td className="px-5 py-3 num text-[var(--color-fg-0)]">
        ${formatUsdc(row.amount)}
      </td>
      <td className="px-5 py-3">
        <CategoryBadge id={row.category} />
      </td>
      <td className="px-5 py-3 font-mono text-xs">
        <a
          href={explorerTx(chainId, row.txHash)}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-rose)] hover:underline"
        >
          FAILED TX ↗
        </a>
      </td>
      <td className="px-5 py-3">
        <span className="text-xs font-mono text-[var(--color-fg-2)]">REFUND DISABLED</span>
      </td>
    </tr>
  )
}

// ─────────────────────────── hooks ────────────────────────────────────
function useReceipts(deployment: Deployment, count: number): ReceiptRow[] {
  // Read all receipts at once via getReceipts() - simplest.
  const { data } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'getReceipts',
  })

  return useMemo<ReceiptRow[]>(() => {
    if (!data) return []
    const arr = data as unknown as readonly { id: bigint; vendor: `0x${string}`; amount: bigint; category: number; status: number; timestamp: bigint }[]
    return arr.map((r) => ({
      id: r.id,
      vendor: r.vendor,
      amount: r.amount,
      category: Number(r.category),
      status: Number(r.status),
      timestamp: r.timestamp,
    }))
  }, [data, count])
}

function useWatchBlockedEvents(deployment: Deployment): BlockedRow[] {
  const [rows, setRows] = useState<BlockedRow[]>([])

  useWatchContractEvent({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    eventName: 'PaymentBlocked',
    onLogs: (logs) => {
      setRows((prev) => {
        const next = [...prev]
        for (const log of logs) {
          const args = (log as unknown as { args: { vendor: `0x${string}`; amount: bigint; category: number; timestamp: bigint; reason: string } }).args
          next.push({
            id: `${log.blockHash}-${log.logIndex}`,
            vendor: args.vendor,
            amount: args.amount,
            category: Number(args.category),
            timestamp: args.timestamp,
            txHash: log.transactionHash ?? '0x',
            reason: args.reason,
          })
        }
        return next
      })
    },
  })

  return rows
}

function CategoryBadge({ id }: { id: number }) {
  const cat = CATEGORIES.find((c) => c.id === id)
  if (!cat) return <span className="badge badge-neutral">UNKNOWN</span>
  const tone = id === 2 ? 'rose' : id === 1 ? 'amber' : 'emerald'
  return <span className={`badge badge-${tone}`}>{cat.label.toUpperCase()}</span>
}

function NoDeployment() {
  return (
    <div className="panel p-8 max-w-xl">
      <span className="label text-[var(--color-rose)]">ERROR / NO CONTRACT DEPLOYED</span>
      <h2 className="text-lg font-medium mt-2">No deployments.json found.</h2>
      <p className="text-sm text-[var(--color-fg-1)] mt-2 leading-relaxed">
        Run <code className="font-mono text-[var(--color-emerald-bright)]">make demo</code> from the project root.
      </p>
    </div>
  )
}

function shortError(m: string): string {
  if (m.length < 80) return m
  return m.slice(0, 77) + '…'
}

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
