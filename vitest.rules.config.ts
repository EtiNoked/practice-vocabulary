import { defineConfig } from 'vitest/config'

/**
 * Rules tests run against the Firestore emulator, in Node — not jsdom, and not
 * with the speech/localStorage stubs the app suite installs.
 *
 * They are a separate config (and a separate `npm run test:rules`) so that
 * `npm test` stays fast and needs no emulator, and therefore no JRE.
 */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    // The emulator is a shared, stateful resource; parallel files would clear
    // each other's data mid-assertion.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
