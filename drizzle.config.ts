import { defineConfig } from 'drizzle-kit'

// Used only to generate migration files (`pnpm db:generate`).
// The app applies them itself at boot; see server/core/migrate.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
})
