import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spend Receipts — Agent Budget Audit',
  description: 'ERC-4337 smart account that enforces per-category USDC caps on AI agent payments. Demo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}

function Header() {
  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-bg-1)]">
      <div className="max-w-6xl mx-auto w-full px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-5 border border-[var(--color-emerald)] rounded-sm grid place-items-center">
            <span className="block size-1.5 bg-[var(--color-emerald)] rounded-sm" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-medium tracking-tight">SPEND RECEIPTS</span>
            <span className="label">AGENT BUDGET AUDIT / v0</span>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink href="/"        label="Setup"      step="01" />
          <NavLink href="/activity" label="Activity"   step="02" />
          <NavLink href="/summary"  label="Summary"    step="03" />
        </nav>
      </div>
    </header>
  )
}

function NavLink({ href, label, step }: { href: string; label: string; step: string }) {
  return (
    <a
      href={href}
      className="px-3 h-9 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[var(--color-fg-1)] hover:text-[var(--color-emerald-bright)] hover:bg-[var(--color-bg-2)] rounded-sm transition-colors"
    >
      <span className="text-[var(--color-fg-2)] text-[10px]">{step}</span>
      <span>{label}</span>
    </a>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-[var(--color-bg-1)]">
      <div className="max-w-6xl mx-auto w-full px-6 py-3 flex items-center justify-between">
        <span className="label">ERC-4337 SMART ACCOUNT / BASE SEPOLIA OR LOCAL ANVIL</span>
        <span className="label mono">DEMO BUILD / NOT FOR PRODUCTION USE</span>
      </div>
    </footer>
  )
}
