// For uptime monitors and the Docker HEALTHCHECK. Answers before setup too.
import { defineEventHandler, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { getSqlite } from '../utils/app.ts'

export default defineEventHandler((event) => {
  const version = String(useRuntimeConfig().appVersion)
  try {
    const { depth } = getSqlite()
      .prepare(`select count(*) as depth from jobs where status in ('queued', 'running')`)
      .get() as { depth: number }
    return { version, database: 'ok', queue: { depth } }
  }
  catch {
    setResponseStatus(event, 503)
    return { version, database: 'error', queue: { depth: 0 } }
  }
})
