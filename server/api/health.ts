// For uptime monitors (UptimeRobot and the like) and the Docker HEALTHCHECK.
// Answers before setup too, and needs no login.
//
//   200 { "status": "ok", ... }      the app and its database are working
//   503 { "status": "error", ... }   the database cannot be read
//
// A monitor can watch the status code, or look for the text "status":"ok".
// It answers GET and HEAD; many monitors (UptimeRobot among them) use HEAD.
import { defineEventHandler, setResponseStatus, useRuntimeConfig } from 'nuxt/server'
import { getSqlite } from '../utils/app.ts'

export default defineEventHandler((event) => {
  if (event.req.method !== 'GET' && event.req.method !== 'HEAD') {
    setResponseStatus(event, 405)
    event.res.headers.set('allow', 'GET, HEAD')
    return { status: 'error', message: 'Use GET or HEAD.' }
  }
  const version = String(useRuntimeConfig().appVersion)
  const uptime = Math.round(process.uptime())
  event.res.headers.set('cache-control', 'no-store')
  try {
    const { depth } = getSqlite()
      .prepare(`select count(*) as depth from jobs where status in ('queued', 'running')`)
      .get() as { depth: number }
    return { status: 'ok', version, database: 'ok', queue: { depth }, uptime }
  }
  catch {
    setResponseStatus(event, 503)
    return { status: 'error', version, database: 'error', queue: { depth: 0 }, uptime }
  }
})
