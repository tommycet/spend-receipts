'use client'

import { useState, useEffect } from 'react'

// ──────────────────────────── contract addresses ──────────────────────────
// Read from the static file `public/deployments.json`, which the Makefile
// copies from `contracts/deployments/latest.json` after each deploy.
//
// If deployments.json is missing the address fields default to zero -
// the UI shows a "no contract deployed" state.

export interface Deployment {
  usdc: `0x${string}`
  spendAccount: `0x${string}`
  vendorResearch: `0x${string}`
  vendorImages: `0x${string}`
  vendorOther: `0x${string}`
  owner: `0x${string}`
  agent: `0x${string}`
  chainId: string
}

const ZERO_DEPLOYMENT: Deployment = {
  usdc:           '0x0000000000000000000000000000000000000000',
  spendAccount:   '0x0000000000000000000000000000000000000000',
  vendorResearch: '0x0000000000000000000000000000000000000000',
  vendorImages:   '0x0000000000000000000000000000000000000000',
  vendorOther:    '0x0000000000000000000000000000000000000000',
  owner:          '0x0000000000000000000000000000000000000000',
  agent:          '0x0000000000000000000000000000000000000000',
  chainId:        '0',
}

export function useDeployment(): { deployment: Deployment; loaded: boolean; isZero: boolean } {
  const [deployment, setDeployment] = useState<Deployment>(ZERO_DEPLOYMENT)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/deployments.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Deployment | null) => {
        if (cancelled) return
        if (j) setDeployment(j)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isZero = deployment.spendAccount === ZERO_DEPLOYMENT.spendAccount
  return { deployment, loaded, isZero }
}

// ──────────────────────────── spend-account ABI ────────────────────────────
export const SPEND_ACCOUNT_ABI = [
  // reads
  { type: 'function', name: 'owner',         stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'agent',         stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'usdc',          stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'balance',       stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getCaps',       stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'getSpentThisWeek', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'receiptCount',  stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getReceipt',    stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [
    { type: 'uint256' },   // id
    { type: 'address' },   // vendor
    { type: 'uint256' },   // amount
    { type: 'uint8'   },   // category (enum)
    { type: 'uint8'   },   // status (enum)
    { type: 'uint64'  },   // timestamp
  ] },
  { type: 'function', name: 'getReceipts',   stateMutability: 'view', inputs: [], outputs: [
    {
      type: 'tuple[]',
      components: [
        { type: 'uint256' }, { type: 'address' }, { type: 'uint256' },
        { type: 'uint8' },   { type: 'uint8' },   { type: 'uint64' },
      ],
    },
  ] },
  { type: 'function', name: 'totals',        stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  // writes
  { type: 'function', name: 'setCaps',       stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setCap',        stateMutability: 'nonpayable', inputs: [{ type: 'uint8' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'demoSeed',      stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'fund',          stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw',      stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'execute',       stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'uint8' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'refund',        stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  // events
  { type: 'event', name: 'PaymentAccepted', inputs: [
    { type: 'uint256', indexed: true  }, { type: 'address', indexed: true  },
    { type: 'uint256'              }, { type: 'uint8',  indexed: true  },
    { type: 'uint64'               },
  ] },
  { type: 'event', name: 'PaymentBlocked', inputs: [
    { type: 'address', indexed: true  },
    { type: 'uint256'              }, { type: 'uint8',  indexed: true  },
    { type: 'uint64'               }, { type: 'string' },
  ] },
  { type: 'event', name: 'Refunded', inputs: [
    { type: 'uint256', indexed: true  },
    { type: 'address', indexed: true  },
    { type: 'uint256'              }, { type: 'uint8', indexed: true  },
  ] },
  { type: 'event', name: 'CapsSet', inputs: [
    { type: 'uint8',  indexed: true  }, { type: 'uint256' },
  ] },
] as const

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf',  stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve',    stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance',  stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'symbol',     stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals',   stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const

// ──────────────────────────── constants ────────────────────────────────────
export const CATEGORIES = [
  { id: 0, label: 'Research' },
  { id: 1, label: 'Images'   },
  { id: 2, label: 'Other'    },
] as const

export const USDC_DECIMALS = 6

export function formatUsdc(units: bigint, decimals = 2): string {
  const v = Number(units) / 1e6
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function parseUsdc(input: string): bigint {
  const n = Number(input)
  if (!Number.isFinite(n) || n < 0) return 0n
  return BigInt(Math.round(n * 1e6))
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a
  return `${a.slice(0, 6)}\u2026${a.slice(-4)}`
}

export function explorerTx(chainId: number, hash: string): string {
  if (chainId === 31337) return `http://127.0.0.1:8545/tx/${hash}`
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${hash}`
  return `https://etherscan.io/tx/${hash}`
}
