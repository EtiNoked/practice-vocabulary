import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // tests/rules/** needs the Firestore emulator (and a JRE) and runs under
    // vitest.rules.config.ts via `npm run test:rules`. Keeping it out here is
    // what lets `npm test` stay fast and dependency-free.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/parse/**', 'src/speech/**', 'src/storage/**', 'src/state/**'],
    },
  },
})
