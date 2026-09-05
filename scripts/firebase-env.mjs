#!/usr/bin/env node
/**
 * Turn the Firebase console's config snippet into .env.local.
 *
 * The console gives you a JavaScript object; this app wants six VITE_ variables.
 * Doing that mapping by hand is the single most error-prone step in the setup —
 * a swapped authDomain and projectId produces an auth error that reads like a
 * permissions problem.
 *
 * Usage:
 *   npm run firebase:env          then paste the snippet and press Ctrl-D
 *   npm run firebase:env -- --force   to overwrite an existing .env.local
 *
 * Accepts either the whole `const firebaseConfig = {...};` block or just the
 * braces, quoted or unquoted keys, with or without trailing commas.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, '.env.local')

const FIELDS = [
  ['apiKey', 'VITE_FIREBASE_API_KEY'],
  ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'VITE_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'VITE_FIREBASE_APP_ID'],
]

const force = process.argv.includes('--force')

if (existsSync(TARGET) && !force) {
  console.error(
    `✗ .env.local already exists.\n` +
      `  Re-run with --force to overwrite it, or edit it by hand.`,
  )
  process.exit(1)
}

/**
 * Read the snippet from a file, or interactively from stdin.
 *
 * Streaming rather than readFileSync(0): reading fd 0 synchronously throws
 * EAGAIN against a macOS TTY, so it only ever worked for piped input.
 */
async function readInput() {
  const fileFlag = process.argv.indexOf('--file')
  if (fileFlag !== -1) {
    const path = process.argv[fileFlag + 1]
    if (!path) {
      console.error('✗ --file needs a path.')
      process.exit(1)
    }
    if (!existsSync(path)) {
      console.error(`✗ No such file: ${path}`)
      process.exit(1)
    }
    return readFileSync(path, 'utf8')
  }

  if (process.stdin.isTTY) {
    console.log('Paste the firebaseConfig snippet from the Firebase console.')
    console.log('Then press Enter, then Ctrl-D.\n')
  }

  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const input = await readInput()

if (input.trim() === '') {
  console.error('✗ Nothing pasted. Copy the config object from the Firebase console and retry.')
  process.exit(1)
}

const found = new Map()
for (const [key, envName] of FIELDS) {
  // Matches  apiKey: "x"  /  "apiKey": 'x'  /  apiKey:`x`
  const match = input.match(new RegExp(`["'\`]?${key}["'\`]?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`))
  if (match?.[1]) found.set(envName, match[1].trim())
}

const missing = FIELDS.filter(([, envName]) => !found.has(envName))
if (missing.length > 0) {
  console.error(
    `✗ Couldn't find ${missing.length} value(s) in what you pasted:\n` +
      missing.map(([key]) => `    ${key}`).join('\n') +
      `\n\n  Copy the whole firebaseConfig object, including the braces.\n` +
      `  Firebase console → Project settings → Your apps → Web app → Config`,
  )
  process.exit(1)
}

// A demo/placeholder project id almost certainly means the wrong thing was pasted.
const projectId = found.get('VITE_FIREBASE_PROJECT_ID')
if (projectId?.startsWith('demo-')) {
  console.error(
    `✗ projectId is "${projectId}". That is an emulator placeholder, not a real project.\n` +
      `  Use the config from your actual Firebase web app.`,
  )
  process.exit(1)
}

const body = [
  '# Written by `npm run firebase:env`.',
  '#',
  '# These values are PUBLIC by design and ship in the built bundle. They are here',
  '# for environment separation, not secrecy. What protects the project is',
  '# firestore.rules, the authorised-domains list, and an HTTP-referrer',
  '# restriction on the browser key.',
  '',
  ...FIELDS.map(([, envName]) => `${envName}=${found.get(envName)}`),
  '',
].join('\n')

writeFileSync(TARGET, body)

console.log(`✓ Wrote .env.local for project "${projectId}"\n`)
for (const [, envName] of FIELDS) {
  const value = found.get(envName) ?? ''
  const shown = envName === 'VITE_FIREBASE_API_KEY' ? `${value.slice(0, 8)}…` : value
  console.log(`    ${envName.padEnd(34)} ${shown}`)
}
console.log(`\nNext:`)
console.log(`    npx firebase deploy --only firestore:rules --project ${projectId}`)
console.log(`    npm run dev        (restart it — Vite reads .env.local at startup)`)
