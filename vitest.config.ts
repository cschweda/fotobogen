import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Image work is slow on small CI machines; five seconds is not always enough.
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30_000 },
      },
      {
        // Runs against the built server; global setup builds it once.
        test: {
          name: 'server',
          include: ['tests/server/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/helpers/build.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
