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
/*
 * The JS budget plus room for the stylesheet and the two Lexend subsets.
 *
 * Counted as a worst case: both font files are added, though `unicode-range` means
 * a real visitor fetches only `latin` unless a word actually needs latin-ext — which
 * for English, Dutch and French it never does. A budget should measure the most a
 * user could pay, not the least.
 */
const ASSET_BUDGET_KB = 220

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
console.log(`  ${'-'.repeat(46)}`)
console.log(`  ${kb(total).padStart(7)} KB  eager JS (budget ${BUDGET_KB} KB)`)

/*
 * Stylesheets and the fonts they pull in.
 *
 * Counted SEPARATELY from the JS figure above, and deliberately so. The JS number
 * with its own budget is what proves the Firebase chunk is still lazy (NFR4a);
 * folding CSS and fonts into it would quietly retire that guarantee behind a
 * single total that could stay green while the JS half doubled.
 *
 * Before this existed the script measured only <script> and modulepreload, which
 * meant a 200 KB webfont could land with the guard reporting success.
 */
let assetTotal = 0
const assetRows = []

for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
  const file = join(DIST, m[1].replace(/^\//, ''))
  if (!existsSync(file)) {
    console.error(`✗ Referenced stylesheet missing from dist: ${m[1]}`)
    process.exit(1)
  }
  const css = readFileSync(file)
  const gz = gzipSync(css).length
  assetTotal += gz
  assetRows.push([m[1], gz, 'gz'])

  // Fonts are referenced from inside the CSS, not from index.html, so this is the
  // only place they can be found. woff2 is ALREADY compressed — gzipping it again
  // reports a smaller, meaningless number, so these are counted raw.
  for (const f of String(css).matchAll(/url\(([^)]+\.(?:woff2?|ttf|otf))\)/g)) {
    const href = f[1].replace(/^["']|["']$/g, '')
    const fontFile = join(DIST, href.replace(/^\//, ''))
    if (!existsSync(fontFile)) {
      console.error(`✗ Referenced font missing from dist: ${href}`)
      process.exit(1)
    }
    const raw = readFileSync(fontFile).length
    assetTotal += raw
    assetRows.push([href, raw, 'raw'])
  }
}

for (const [href, size, kind] of assetRows) {
  console.log(`  ${kb(size).padStart(7)} KB  ${href}${kind === 'raw' ? '  (raw)' : ''}`)
}

const grandTotal = total + assetTotal
console.log(`  ${'-'.repeat(46)}`)
console.log(
  `  ${kb(grandTotal).padStart(7)} KB  eager total incl. CSS + fonts (budget ${ASSET_BUDGET_KB} KB)`,
)

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

if (grandTotal / 1024 > ASSET_BUDGET_KB) {
  console.error(
    `\n✗ Eager total including CSS and fonts is ${kb(grandTotal)} KB, over the ` +
      `${ASSET_BUDGET_KB} KB budget.\n` +
      `  The usual cause is a webfont subset that grew, or a second family being added.`,
  )
  process.exit(1)
}

console.log(
  `\n✓ Eager JS within budget (${kb(total)} KB ≤ ${BUDGET_KB} KB), ` +
    `total with CSS + fonts ${kb(grandTotal)} KB ≤ ${ASSET_BUDGET_KB} KB.`,
)
