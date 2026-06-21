'use client'

import { useAccount, useChainId, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useMemo, useState, useEffect } from 'react'
import { formatUsdc, parseUsdc, useDeployment, SPEND_ACCOUNT_ABI, CATEGORIES, type Deployment } from '@/lib/contract'

export default function SetupPage() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { deployment, loaded, isZero } = useDeployment()

  if (!loaded) {
    return <div className="state-msg">LOADING DEPLOYMENT…</div>
  }
  if (isZero) {
    return <NoDeployment />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <SectionHeader step="01" title="Setup" sub="Connect wallet, fund smart account, set per-category caps." />

        <ConnectCard />
        <FundAndSeedCard deployment={deployment} />
        <CapsCard deployment={deployment} />
      </div>

      <aside className="space-y-6">
        <AccountStatusCard deployment={deployment} />
        <DemoScriptCard />
      </aside>
    </div>
  )
}

// ─────────────────────────── header ───────────────────────────────────
function SectionHeader({ step, title, sub }: { step: string; title: string; sub: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="label mono text-[var(--color-emerald)]">{step}</span>
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      </div>
      <p className="text-sm text-[var(--color-fg-1)] mt-1">{sub}</p>
      <hr className="hr" />
    </div>
  )
}

// ─────────────────────────── connect ──────────────────────────────────
function ConnectCard() {
  const { isConnected, address, chainId } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return <SkeletonPanel label="WALLET" />
  if (!isConnected) return <DisconnectedPanel />
  return <ConnectedPanel address={address!} chainId={chainId ?? 0} />
}

function DisconnectedPanel() {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="dot dot-idle" />
          <span className="label">WALLET / DISCONNECTED</span>
        </div>
        <span className="label mono">STEP 01.A</span>
      </div>
      <p className="text-sm text-[var(--color-fg-1)] mb-4">
        Marcus connects MetaMask to own the smart account and sign refund transactions.
      </p>
      <ConnectButton />
      <hr className="hr" />
      <div className="text-xs text-[var(--color-fg-2)] font-mono leading-relaxed">
        REQUIRED: METAMASK INSTALLED.<br />
        NETWORK: ANVIL LOCAL (31337) OR BASE SEPOLIA (84532).<br />
        SWITCH FROM METAMASK IF PROMPTED.
      </div>
    </div>
  )
}

function ConnectedPanel({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="dot" />
          <span className="label">WALLET / CONNECTED</span>
        </div>
        <span className="badge badge-emerald">STEP 01.A / DONE</span>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="OWNER ADDRESS" value={address} mono />
        <Field label="CHAIN ID" value={chainId === 31337 ? '31337 / ANVIL LOCAL' : chainId === 84532 ? '84532 / BASE SEPOLIA' : `${chainId}`} mono />
      </div>
    </div>
  )
}

// ─────────────────────────── connect button (vanilla wagmi) ───────────
function ConnectButton() {
  const { connectors, connect, isPending, error } = useConnect()
  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0]

  return (
    <div className="flex items-center gap-3">
      <button
        className="btn btn-primary"
        onClick={() => injected && connect({ connector: injected })}
        disabled={!injected || isPending}
      >
        {isPending ? 'CONNECTING…' : 'CONNECT METAMASK'}
      </button>
      {error && <span className="text-xs text-[var(--color-rose)] font-mono">{shortError(error.message)}</span>}
    </div>
  )
}

// ─────────────────────────── fund + seed ──────────────────────────────
function FundAndSeedCard({ deployment }: { deployment: Deployment }) {
  const { isConnected } = useAccount()
  const [topup, setTopup] = useState('20')
  const [research, setResearch] = useState('10')
  const [images, setImages] = useState('5')
  const [other, setOther] = useState('0')

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  function seed() {
    writeContract({
      address: deployment.spendAccount,
      abi: SPEND_ACCOUNT_ABI,
      functionName: 'demoSeed',
      args: [parseUsdc(topup), parseUsdc(research), parseUsdc(images), parseUsdc(other)],
    })
  }

  useEffect(() => {
    if (isConfirmed) {
      const t = setTimeout(reset, 1500)
      return () => clearTimeout(t)
    }
  }, [isConfirmed, reset])

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="dot dot-idle" />
          <span className="label">FUND + CAPS / ONE-TAP SEED</span>
        </div>
        <span className="label mono">STEP 01.B</span>
      </div>

      <p className="text-sm text-[var(--color-fg-1)] mb-4">
        One transaction mints test USDC directly into the smart account and applies the caps below. The brief&apos;s
        defaults match the demo: 20 USDC funded, Research 10/wk, Images 5/wk, Other 0/wk.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <NumericField label="TOP-UP (USDC)"  value={topup}    onChange={setTopup}    hint="default 20" />
        <NumericField label="RESEARCH (USDC)" value={research} onChange={setResearch} hint="cap per week" />
        <NumericField label="IMAGES (USDC)"   value={images}   onChange={setImages}   hint="cap per week" />
        <NumericField label="OTHER (USDC)"    value={other}    onChange={setOther}    hint="0 = blocked" />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={seed} disabled={!isConnected || isPending || isMining}>
          {isPending ? 'CONFIRM IN WALLET…' : isMining ? 'MINING…' : isConfirmed ? 'SEEDED' : 'SEED DEMO STATE'}
        </button>
        <TxStatus hash={hash} isMining={isMining} isConfirmed={isConfirmed} error={error} />
      </div>
    </div>
  )
}

// ─────────────────────────── caps editor ──────────────────────────────
function CapsCard({ deployment }: { deployment: Deployment }) {
  const { isConnected, address } = useAccount()
  const [research, setResearch] = useState('10')
  const [images, setImages] = useState('5')
  const [other, setOther] = useState('0')

  const { data: caps } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'getCaps',
  })
  const { data: spent } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'getSpentThisWeek',
  })

  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isMining, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })

  function save() {
    writeContract({
      address: deployment.spendAccount,
      abi: SPEND_ACCOUNT_ABI,
      functionName: 'setCaps',
      args: [parseUsdc(research), parseUsdc(images), parseUsdc(other)],
    })
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="dot dot-idle" />
          <span className="label">CAPS / EDIT</span>
        </div>
        <span className="label mono">STEP 02</span>
      </div>

      <div className="space-y-4">
        <CapRow
          label="RESEARCH"
          color="emerald"
          sliderValue={Number(research)}
          onSliderChange={setResearch}
          inputValue={research}
          onInputChange={setResearch}
          contractCap={caps ? formatUsdc(caps[0] as bigint) : '-'}
          contractSpent={spent ? formatUsdc(spent[0] as bigint) : '-'}
        />
        <CapRow
          label="IMAGES"
          color="emerald"
          sliderValue={Number(images)}
          onSliderChange={setImages}
          inputValue={images}
          onInputChange={setImages}
          contractCap={caps ? formatUsdc(caps[1] as bigint) : '-'}
          contractSpent={spent ? formatUsdc(spent[1] as bigint) : '-'}
        />
        <CapRow
          label="OTHER"
          color="rose"
          sliderValue={Number(other)}
          onSliderChange={setOther}
          inputValue={other}
          onInputChange={setOther}
          contractCap={caps ? formatUsdc(caps[2] as bigint) : '-'}
          contractSpent={spent ? formatUsdc(spent[2] as bigint) : '-'}
        />
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button className="btn btn-primary" onClick={save} disabled={!isConnected || isPending || isMining}>
          {isPending ? 'CONFIRM…' : isMining ? 'MINING…' : isConfirmed ? 'SAVED' : 'SAVE CAPS ON-CHAIN'}
        </button>
        <TxStatus hash={hash} isMining={isMining} isConfirmed={isConfirmed} error={error} />
      </div>
    </div>
  )
}

function CapRow({
  label, color, sliderValue, onSliderChange, inputValue, onInputChange, contractCap, contractSpent,
}: {
  label: string
  color: 'emerald' | 'rose'
  sliderValue: number
  onSliderChange: (v: string) => void
  inputValue: string
  onInputChange: (v: string) => void
  contractCap: string
  contractSpent: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label">{label}</span>
        <div className="flex items-center gap-3 text-xs font-mono text-[var(--color-fg-2)]">
          <span>CAP ON-CHAIN: <span className="text-[var(--color-fg-0)]">{contractCap}</span></span>
          <span>SPENT: <span className="text-[var(--color-fg-0)]">{contractSpent}</span></span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={sliderValue}
          onChange={(e) => onSliderChange(e.target.value)}
          className="flex-1"
          aria-label={`${label} cap slider`}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--color-fg-2)] font-mono">$</span>
          <input
            type="number"
            min={0}
            max={20}
            step={1}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            className="input w-16 text-right"
            aria-label={`${label} cap number`}
          />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── account status ───────────────────────────
function AccountStatusCard({ deployment }: { deployment: Deployment }) {
  const { data: balance } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'balance',
  })
  const { data: owner } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'owner',
  })
  const { data: agent } = useReadContract({
    address: deployment.spendAccount,
    abi: SPEND_ACCOUNT_ABI,
    functionName: 'agent',
  })

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="dot" />
        <span className="label">ACCOUNT STATE</span>
      </div>
      <dl className="space-y-2.5">
        <StatRow label="BALANCE (USDC)" value={balance !== undefined ? formatUsdc(balance as bigint) : '…'} mono accent />
        <StatRow label="SPEND ACCOUNT"  value={deployment.spendAccount} mono truncate />
        <StatRow label="OWNER"          value={owner ? String(owner) : '…'} mono truncate />
        <StatRow label="AGENT"          value={agent ? String(agent) : '…'} mono truncate />
        <StatRow label="USDC TOKEN"     value={deployment.usdc} mono truncate />
      </dl>
    </div>
  )
}

// ─────────────────────────── script ───────────────────────────────────
function DemoScriptCard() {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="dot dot-idle" />
        <span className="label">DEMO SCRIPT</span>
      </div>
      <ol className="space-y-2 text-sm text-[var(--color-fg-1)] font-mono leading-relaxed">
        <li><span className="text-[var(--color-emerald-bright)]">01.</span> Click SEED DEMO STATE.</li>
        <li><span className="text-[var(--color-emerald-bright)]">02.</span> Go to ACTIVITY tab.</li>
        <li><span className="text-[var(--color-emerald-bright)]">03.</span> Click 3 agent payment buttons.</li>
        <li><span className="text-[var(--color-emerald-bright)]">04.</span> Refund the $4 receipt.</li>
        <li><span className="text-[var(--color-emerald-bright)]">05.</span> Check SUMMARY for end-state totals.</li>
      </ol>
    </div>
  )
}

// ─────────────────────────── no deployment state ─────────────────────
function NoDeployment() {
  return (
    <div className="panel p-8 max-w-xl">
      <span className="label text-[var(--color-rose)]">ERROR / NO CONTRACT DEPLOYED</span>
      <h2 className="text-lg font-medium mt-2">No deployments.json found.</h2>
      <p className="text-sm text-[var(--color-fg-1)] mt-2 leading-relaxed">
        Run <code className="font-mono text-[var(--color-emerald-bright)]">make demo</code> from the project root.
        It starts anvil, deploys contracts, and copies <code className="font-mono">deployments/latest.json</code> into
        the frontend&apos;s public directory.
      </p>
    </div>
  )
}

// ─────────────────────────── shared bits ──────────────────────────────
function NumericField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full mt-1"
      />
      {hint && <span className="text-[10px] text-[var(--color-fg-2)] font-mono uppercase tracking-widest">{hint}</span>}
    </label>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`mt-1 text-sm break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function StatRow({ label, value, mono, accent, truncate }: { label: string; value: string; mono?: boolean; accent?: boolean; truncate?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="label">{label}</dt>
      <dd className={`text-sm ${mono ? 'font-mono' : ''} ${accent ? 'text-[var(--color-emerald-bright)] text-lg' : ''} ${truncate ? 'truncate' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function TxStatus({ hash, isMining, isConfirmed, error }: { hash?: `0x${string}`; isMining: boolean; isConfirmed: boolean; error: Error | null }) {
  if (error) return <span className="text-xs text-[var(--color-rose)] font-mono">{shortError(error.message)}</span>
  if (isConfirmed && hash) return <span className="text-xs text-[var(--color-emerald-bright)] font-mono">CONFIRMED</span>
  if (isMining) return <span className="text-xs text-[var(--color-fg-1)] font-mono">MINING…</span>
  if (hash) return <span className="text-xs text-[var(--color-fg-1)] font-mono">TX SUBMITTED</span>
  return null
}

function SkeletonPanel({ label }: { label: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <span className="dot dot-idle" />
        <span className="label">{label}</span>
      </div>
      <div className="mt-3 h-16 bg-[var(--color-bg-2)] border border-[var(--color-line)] animate-pulse rounded-sm" />
    </div>
  )
}

function shortError(m: string): string {
  if (m.length < 80) return m
  return m.slice(0, 77) + '…'
}
