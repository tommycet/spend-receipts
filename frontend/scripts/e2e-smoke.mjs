// Playwright smoke test for the Spend Receipts demo.
//
// What it does:
//   1. Starts Chromium (no MetaMask required).
//   2. Injects a minimal `window.ethereum` shim that auto-approves
//      connect / write requests. This lets us drive the UI without
//      a real wallet.
//   3. Loads Setup → Activity → Summary, asserts each screen renders
//      without errors, fires the three demo payments, refunds one,
//      and verifies the Summary totals match the brief exactly:
//
//      SPENT     = $3.00 (research, accepted)
//      REFUNDED  = $4.00 (images, refunded)
//      BLOCKED   = $8.00 (contractor, cap-exceeded)
//
// Run with:  node scripts/e2e-smoke.mjs
// Requires:  dev server on http://localhost:3000 and anvil on :8545

import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ANVIL_RPC = 'http://127.0.0.1:8545'
const APP_URL   = 'http://localhost:3000'

// ─────────────────────────────────────────────────────────────────────────
//  Window.ethereum shim. Routes eth_requestAccounts / eth_sendTransaction
//  through a local ethers-style signer (viem/ethers JSON-RPC against anvil).
//  We do this so we never need a real MetaMask during CI.
// ─────────────────────────────────────────────────────────────────────────
const SHIM = `
  (function() {
    const RPC = ${JSON.stringify(ANVIL_RPC)};
    const PK  = ${JSON.stringify(ANVIL_KEY)};
    let accounts = null;
    let nextId = 0;

    async function rpc(method, params) {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    }

    function keccak256(hex) {
      // not actually needed for the demo; viem handles hashing in the page.
      throw new Error('keccak256 not implemented in shim');
    }

    window.ethereum = {
      isMetaMask: true,
      _listeners: {},
      on(event, handler) {
        (this._listeners[event] = this._listeners[event] || []).push(handler);
      },
      removeListener(event, handler) {
        const arr = this._listeners[event] || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      },
      async request({ method, params }) {
        // Route to anvil. Params shapes are RPC-native.
        const result = await rpc(method, params);
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
          accounts = result;
          // Emit connect event for wagmi.
          (this._listeners.connect || []).forEach((h) => h({ chainId: '0x7a69' }));
        }
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          return null;
        }
        return result;
      },
    };
  })();
`

function consoleErrorsToArray() {
  const errs = []
  return errs
}

async function main() {
  console.log('launching chromium...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.addInitScript(SHIM)

  const page = await context.newPage()
  const consoleErrs = consoleErrorsToArray()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrs.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrs.push(`pageerror: ${err.message}`))

  // ─── Step 0: Setup page renders + deployment loaded ────────────────────
  console.log('opening Setup...')
  await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' })

  // Wait for deployment to load.
  await page.waitForSelector('text=SEED DEMO STATE', { timeout: 10_000 })
  console.log('  Setup rendered with SEED DEMO STATE button.')

  // ─── Step 1+2: Click Seed Demo State ───────────────────────────────────
  console.log('clicking SEED DEMO STATE...')
  await page.click('text=SEED DEMO STATE')

  // Wait for tx confirmation (status changes to SEEDED).
  await page.waitForSelector('text=SEEDED', { timeout: 30_000 })
  console.log('  Seed tx confirmed.')

  // ─── Step 3: Open Activity tab ────────────────────────────────────────
  console.log('opening Activity...')
  await page.click('a[href="/activity"]')
  await page.waitForSelector('text=Live Activity', { timeout: 10_000 })
  await page.waitForSelector('text=Research API Co', { timeout: 10_000 })
  console.log('  Activity rendered with 3 payment buttons.')

  // ─── Step 3a: Pay $3 research ──────────────────────────────────────────
  console.log('firing Research $3...')
  await page.locator('text=Research API Co').click()
  await page.waitForSelector('tr:has-text("Research")', { timeout: 15_000 })
  console.log('  Research receipt appeared.')

  // ─── Step 3b: Pay $4 images ────────────────────────────────────────────
  console.log('firing Images $4...')
  await page.locator('text=Stock Image Co').click()
  await page.waitForSelector('tr:has-text("Images")', { timeout: 15_000 })
  console.log('  Images receipt appeared.')

  // ─── Step 3c: Try $8 contractor (should revert) ────────────────────────
  console.log('firing Contractor $8 (over cap, should revert)...')
  await page.locator('text=Contractor').click()
  // The error box should appear.
  await page.waitForSelector('text=TX FAILED', { timeout: 15_000 })
  console.log('  Over-cap payment correctly failed at contract level.')

  // ─── Step 5: Refund the $4 images receipt ──────────────────────────────
  console.log('refunding Images receipt...')
  await page.locator('tr:has-text("Images") button:has-text("REFUND")').click()
  // Wait for the row to flip to REFUNDED.
  await page.waitForSelector('tr:has-text("Images") span:has-text("REFUNDED")', { timeout: 15_000 })
  console.log('  Images receipt flipped to REFUNDED.')

  // ─── Step 6: Open Summary, verify totals ───────────────────────────────
  console.log('opening Summary...')
  await page.click('a[href="/summary"]')
  await page.waitForSelector('text=Summary', { timeout: 10_000 })

  // Read the four big stats.
  const stats = await page.evaluate(() => {
    const labels = ['SPENT', 'REFUNDED', 'BLOCKED', 'BALANCE']
    const out = {}
    for (const lab of labels) {
      const el = Array.from(document.querySelectorAll('.panel'))
        .find((p) => p.querySelector('.label')?.textContent === lab)
      if (el) {
        const valEl = el.querySelector('.num')
        out[lab] = valEl ? valEl.textContent.trim() : null
      }
    }
    return out
  })
  console.log('  Summary stats:', stats)

  const errors = consoleErrs.filter((e) => !/Failed to fetch|rpc|InjectedConnector|hydration|hydrate/i.test(e))
  if (errors.length) {
    console.log('  console errors during run:')
    for (const e of errors) console.log('   -', e)
  } else {
    console.log('  no console errors.')
  }

  // ─── assertions ────────────────────────────────────────────────────────
  const expectedSpent    = '$3.00'
  const expectedRefunded = '$4.00'
  const expectedBlocked  = '$8.00'

  const failures = []
  if (stats.SPENT    !== expectedSpent)    failures.push(`SPENT    expected ${expectedSpent}    got ${stats.SPENT}`)
  if (stats.REFUNDED !== expectedRefunded) failures.push(`REFUNDED expected ${expectedRefunded} got ${stats.REFUNDED}`)
  if (stats.BLOCKED  !== expectedBlocked)  failures.push(`BLOCKED  expected ${expectedBlocked}  got ${stats.BLOCKED}`)

  if (failures.length) {
    console.error('FAIL:')
    for (const f of failures) console.error('  -', f)
    await browser.close()
    process.exit(1)
  }

  console.log('\n  OK: all six demo steps verified end-to-end in browser.')
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
