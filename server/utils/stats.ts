// Visitor statistics as the server keeps and applies them (shared/stats.ts has the rules).
import { cleanStats, STATS_OFF, statsTags, type StatsSettings, type StatsTags } from '../../shared/stats.ts'
import { getSetting } from './settings.ts'

export const STATS_KEY = 'stats.settings'

export function statsSettings(): StatsSettings {
  // Read through the same checks as when saving, so a hand-edited database cannot put anything odd on a page.
  const { settings, errors } = cleanStats(getSetting<unknown>(STATS_KEY, {}))
  return Object.keys(errors).length > 0 ? { ...STATS_OFF, otherAttributes: [] } : settings
}

/** The pages a counting script is never put on: the admin, the login, setup, and anything that is not a page. */
const NOT_COUNTED = /^\/+(admin|login|setup|api|_nuxt|__nuxt|media|brand)(\/|$)/i

/** The tags for a page at this path, or null: statistics off, or not a public page. */
export function statsForPath(path: string): StatsTags | null {
  let plain: string
  try {
    plain = decodeURIComponent(path.split('?')[0] ?? '')
  }
  catch {
    return null
  }
  if (NOT_COUNTED.test(plain)) return null
  return statsTags(statsSettings())
}
