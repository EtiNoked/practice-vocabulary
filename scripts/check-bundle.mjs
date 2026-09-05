#!/usr/bin/env node
/**
 * Bundle budget guard — NFR4a.
 *
 * v1 shipped under 150 KB gzipped with zero runtime dependencies beyond React.
 * Firebase auth + firestore is roughly another 150 KB gzipped, which would DOUBLE
 * the download for signed-out users to serve a feature they are not using.
 *
 * The defence is that every Firebase import sits behind a dynamic import() in
 * src/auth/firebase.ts, so Rollup emits it as a separate chunk that only a
 * signing-in user fetches. This script is what stops that silently regressing.
 *
 * "What a guest downloads" is measured as the chunks index.html loads EAGERLY:
 * the entry module plus its modulepreload links. Lazy chunks are not referenced
 * there, which is precisely the property being asserted.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const BUDGET_KB = 150

const indexPath = join(DIST, 'index.html')
if (!existsSync(indexPath)) {
  console.error('✗ dist/index.html not found. Run `npm run build` first.')
  process.exit(1)
}

const html = readFileSync(indexPath, 'utf8')

// Eagerly-loaded JS: the entry <script type="module"> plus every modulepreload.
const eager = new Set()
for (const m of html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)) eager.add(m[1])
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) eager.add(m[1])

if (eager.size === 0) {
  console.error('✗ No eager module scripts found in dist/index.html — is the build correct?')
  process.exit(1)
}

let total = 0
const rows = []
for (const href of eager) {
  const file = join(DIST, href.replace(/^\//, ''))
  if (!existsSync(file)) {
    console.error(`✗ Referenced chunk missing from dist: ${href}`)
    process.exit(1)
  }
  const gz = gzipSync(readFileSync(file)).length
  total += gz
  rows.push([href, gz])
}

const kb = (b) => (b / 1024).toFixed(1)
rows.sort((a, b) => b[1] - a[1])
for (const [href, gz] of rows) console.log(`  ${kb(gz).padStart(7)} KB  ${href}`)

const totalKb = total / 1024
console.log(`  ${'-'.repeat(30)}`)
console.log(`  ${kb(total).padStart(7)} KB  eager total (budget ${BUDGET_KB} KB)`)

// A Firebase chunk in the eager set means a static import crept back in.
const leaked = rows.filter(([href]) => /firebase/i.test(href))
if (leaked.length > 0) {
  console.error(
    `\n✗ Firebase is in the EAGER bundle: ${leaked.map(([h]) => h).join(', ')}\n` +
      `  Signed-out users must download zero Firebase (NFR4a). Something is importing\n` +
      `  firebase/* statically instead of through src/auth/firebase.ts. See plan.md R3.`,
  )
  process.exit(1)
}

if (totalKb > BUDGET_KB) {
  console.error(
    `\n✗ Eager bundle is ${kb(total)} KB gzipped, over the ${BUDGET_KB} KB budget (NFR4a).`,
  )
  process.exit(1)
}

console.log(`\n✓ Eager bundle within budget (${kb(total)} KB ≤ ${BUDGET_KB} KB).`)
