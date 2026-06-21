'use client'

import { useAccount, useChainId, useReadContract, useWatchContractEvent } from 'wagmi'
import { useMemo, useState } from 'react'
import { useDeployment, SPEND_ACCOUNT_ABI, formatUsdc, explorerTx, CATEGORIES, type Deployment } from '@/lib/contract'

interface BlockedRow {
  id:        string
  vendor:    `0x${string}`
  amount:    bigint
  category:  number
  timestamp: bigint
  txHash:    `0x${string}`
  reason:    string
}

export default function SummaryPage() {
  const { isConnected } = useAccount()
  const chainId = useChainId() ?? 0
  const { deployment, loaded, isZero } = useDeployment()

  if (!loaded) return <div className="state-msg">LOADING…</div>
  if (isZero)  return <NoDeployment />

  return (
    <div className="space-y-6">
      <Header />
      <FinalTotals deployment={deployment} />
      <ReceiptTable deployment={deployment} chainId={chainId} />
      <ExportPanel deployment={deployment} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="label mono text-[var(--color-emerald)]">03</span>
        <h1 className="text-xl font-medium tracking-tight">Summary</h1>
      </div>
      <p className="text-sm text-[var(--color-fg-1)] mt-1">
        End-of-demo totals. Every row links to Basescan for independent verification.
      </p>
      <hr className="hr" />
    </div>
  )
}

function FinalTotals({ deployment }: { deployment: Deployment }) {
  const { data: totals } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'totals',
  })

  const { data: balance } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'balance',
  })

  const blockedEvents = useBlockedRows(deployment)
  const blockedTotal  = blockedEvents.reduce((s, e) => s + e.amount, 0n)

  const spent    = totals ? formatUsdc(totals[0] as bigint) : '0.00'
  const refunded = totals ? formatUsdc(totals[1] as bigint) : '0.00'
  const blocked  = formatUsdc(blockedTotal)

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <BigStat label="SPENT"     value={spent}    hint="Cleared out of the smart account." accent="emerald" />
      <BigStat label="REFUNDED"  value={refunded} hint="Returned from vendors." accent="amber" />
      <BigStat label="BLOCKED"   value={blocked}  hint="Cap-rejected at protocol level." accent="rose" />
      <BigStat label="BALANCE"   value={balance !== undefined ? formatUsdc(balance as bigint) : '…'} hint="USDC remaining in account." accent="neutral" />
    </div>
  )
}

function BigStat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: 'emerald' | 'amber' | 'rose' | 'neutral' }) {
  const accentClass =
    accent === 'emerald' ? 'text-[var(--color-emerald-bright)]' :
    accent === 'amber'   ? 'text-[var(--color-amber)]' :
    accent === 'rose'    ? 'text-[var(--color-rose)]' :
                           'text-[var(--color-fg-0)]'
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="label">{label}</span>
        <span className={`badge ${accent === 'neutral' ? 'badge-neutral' : `badge-${accent}`}`}>{accent.toUpperCase()}</span>
      </div>
      <div className={`num text-3xl ${accentClass}`}>${value}</div>
      <p className="text-xs text-[var(--color-fg-2)] mt-2 font-mono leading-snug">{hint}</p>
    </div>
  )
}

function ReceiptTable({ deployment, chainId }: { deployment: Deployment; chainId: number }) {
  const { data: receipts } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'getReceipts',
  })
  const blocked = useBlockedRows(deployment)

  const rows = useMemo(() => {
    if (!receipts) return []
    const arr = receipts as unknown as readonly { id: bigint; vendor: `0x${string}`; amount: bigint; category: number; status: number; timestamp: bigint }[]
    return arr.map((r) => ({
      id: r.id,
      vendor: r.vendor,
      amount: r.amount,
      category: Number(r.category),
      status: Number(r.status),
      timestamp: Number(r.timestamp),
    }))
  }, [receipts])

  if (rows.length === 0 && blocked.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <span className="state-msg">NO RECEIPTS TO SUMMARISE</span>
        <p className="text-sm text-[var(--color-fg-2)] mt-2">Complete the demo on the Activity tab.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-2">
          <span className="dot" />
          <span className="label">END-STATE LEDGER</span>
        </div>
        <span className="label mono">{rows.length + blocked.length} ROWS</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--color-fg-2)] font-mono text-[10px] uppercase tracking-widest border-b border-[var(--color-line)]">
            <th className="px-5 py-2.5 font-normal">STATUS</th>
            <th className="px-5 py-2.5 font-normal">CATEGORY</th>
            <th className="px-5 py-2.5 font-normal">VENDOR</th>
            <th className="px-5 py-2.5 font-normal text-right">AMOUNT</th>
            <th className="px-5 py-2.5 font-normal">TX HASH</th>
          </tr>
        </thead>
        <tbody>
          {blocked.map((b, i) => (
            <tr key={`b-${b.id}`} className={`border-b border-[var(--color-line)] ${i % 2 === 1 ? 'bg-[rgba(255,255,255,0.01)]' : ''}`}>
              <td className="px-5 py-3"><span className="badge badge-rose">BLOCKED</span></td>
              <td className="px-5 py-3"><CategoryBadge id={b.category} /></td>
              <td className="px-5 py-3 font-mono text-xs text-[var(--color-fg-1)]">{shortAddr(b.vendor)}</td>
              <td className="px-5 py-3 num text-right text-[var(--color-fg-0)]">${formatUsdc(b.amount)}</td>
              <td className="px-5 py-3 font-mono text-xs">
                <a className="text-[var(--color-rose)] hover:underline" href={explorerTx(chainId, b.txHash)} target="_blank" rel="noreferrer">
                  FAILED ↗
                </a>
              </td>
            </tr>
          ))}
          {rows.map((r, i) => (
            <tr key={`r-${r.id}`} className={`border-b border-[var(--color-line)] ${i % 2 === 1 ? 'bg-[rgba(255,255,255,0.01)]' : ''}`}>
              <td className="px-5 py-3">
                <span className={`badge ${r.status === 1 ? 'badge-amber' : 'badge-emerald'}`}>
                  {r.status === 1 ? 'REFUNDED' : 'ACCEPTED'}
                </span>
              </td>
              <td className="px-5 py-3"><CategoryBadge id={r.category} /></td>
              <td className="px-5 py-3 font-mono text-xs text-[var(--color-fg-1)]">{shortAddr(r.vendor)}</td>
              <td className="px-5 py-3 num text-right text-[var(--color-fg-0)]">${formatUsdc(r.amount)}</td>
              <td className="px-5 py-3 font-mono text-xs text-[var(--color-fg-2)]">#{String(r.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ExportPanel({ deployment }: { deployment: Deployment }) {
  const { data: receipts } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'getReceipts',
  })

  function exportCsv() {
    if (!receipts) return
    const header = 'id,status,vendor,amount_usdc,category,timestamp_iso\n'
    const arr = receipts as unknown as readonly { id: bigint; vendor: `0x${string}`; amount: bigint; category: number; status: number; timestamp: bigint }[]
    const body = arr.map((r) => {
      const cat = CATEGORIES.find((c) => c.id === Number(r.category))
      return [
        String(r.id),
        r.status === 1 ? 'REFUNDED' : 'ACCEPTED',
        r.vendor,
        (Number(r.amount) / 1e6).toFixed(2),
        cat ? cat.label : 'Unknown',
        new Date(Number(r.timestamp) * 1000).toISOString(),
      ].join(',')
    }).join('\n')

    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spend-receipts-${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel p-5 flex items-center justify-between">
      <div>
        <span className="label">EXPORT</span>
        <p className="text-sm text-[var(--color-fg-1)] mt-1">Download the end-state ledger as CSV for audit or expense report.</p>
      </div>
      <button className="btn" onClick={exportCsv} disabled={!receipts}>
        EXPORT CSV
      </button>
    </div>
  )
}

function useBlockedRows(deployment: Deployment): BlockedRow[] {
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

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
