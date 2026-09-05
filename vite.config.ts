import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // This repo lives in iCloud Drive, which touches files continuously as it
      // syncs, and node_modules (829 MB) and dist are both in-tree. Vite's
      // default watcher can read that churn as source edits and issue a full
      // page reload, which wipes in-memory app state mid-drill.
      //
      // NOT usePolling: true. Polling is the usual iCloud/network-drive
      // workaround for MISSED events; the failure mode here is the opposite —
      // too many events — and polling would make it worse while also walking
      // 829 MB on a timer.
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**'],
      usePolling: false,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Vitest skips CSS by default, handing back an empty string for every form
    // of import. theme.test.ts asserts against the compiled stylesheet — that
    // the design tokens actually reach it, and that .btn really does carry the
    // 44px minimum — so it needs the real thing. Nothing else imports CSS, so
    // this costs one file.
    css: true,
    // tests/rules/** needs the Firestore emulator (and a JRE) and runs under
    // vitest.rules.config.ts via `npm run test:rules`. Keeping it out here is
    // what lets `npm test` stay fast and dependency-free.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/parse/**', 'src/speech/**', 'src/storage/**', 'src/state/**'],
    },
  },
})
