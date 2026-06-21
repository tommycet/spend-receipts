'use client'

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

// ──────────────────────────── chains ───────────────────────────────────────
// Anvil (local dev) — quickstart runs against this.
const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  blockExplorers: { default: { name: 'Local', url: 'http://127.0.0.1:8545' } },
})

// Base Sepolia — production demo target.
const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia.base.org'] },
    alchemy:  { http: ['https://base-sepolia.g.alchemy.com/v2/demo'] },
  },
  blockExplorers: { default: { name: 'Basescan', url: 'https://sepolia.basescan.org' } },
})

// ──────────────────────────── config ───────────────────────────────────────
// Only the injected (MetaMask) connector — no email/social/managed wallets
// for a hackathon demo. Reviewers must have MetaMask installed.
export const wagmiConfig = createConfig({
  chains: [anvil, baseSepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [anvil.id]:       http('http://127.0.0.1:8545'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
