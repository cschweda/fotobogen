import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
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
