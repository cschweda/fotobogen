// Finds out whether a newer version of Fotobogen has been released, by
// asking GitHub for the latest release. This is an outside request, so it
// happens only when the admin presses "Check for updates", or once a day if
// the admin has switched automatic checks on. They are off until the owner
// says yes: the admin asks once, and remembers either answer.
// Nothing about the site is sent: it is a plain, anonymous GET.
import { useRuntimeConfig } from 'nuxt/server'
import { isNewer, parseVersion } from '../core/version.ts'
import { getSetting, setSettings } from './settings.ts'

export interface UpdateStatus {
  current: string
  /** The latest release, when one is known. */
  latest: string | null
  /** Where to read about it. */
  url: string | null
  newer: boolean
  /** When GitHub was last asked, in milliseconds; null if never. */
  checkedAt: number | null
  /** Why the last check did not work, when it did not. */
  problem: string | null
  automatic: boolean
  /** Whether the owner has said yes or no to checking once a day. Until then the admin asks. */
  decided: boolean
}

const RELEASES = 'https://api.github.com/repos/cschweda/fotobogen/releases/latest'
const DAY = 24 * 60 * 60 * 1000
interface Stored { latest: string | null, url: string | null, checkedAt: number, problem: string | null }

const current = (): string => String(useRuntimeConfig().appVersion)

/** The address if it is one of the project's own pages on GitHub once resolved (no "../" out of it); otherwise the releases page. */
function projectPage(address: unknown): string {
  const releases = 'https://github.com/cschweda/fotobogen/releases'
  if (typeof address !== 'string') return releases
  try {
    const url = new URL(address)
    return url.origin === 'https://github.com' && url.pathname.startsWith('/cschweda/fotobogen/') && !url.username && !url.password ? url.href : releases
  }
  catch {
    return releases
  }
}

export function updateStatus(): UpdateStatus {
  const stored = getSetting<Stored | null>('updates.last', null)
  return {
    current: current(),
    latest: stored?.latest ?? null,
    url: stored?.url ? projectPage(stored.url) : null,
    newer: isNewer(stored?.latest, current()),
    checkedAt: stored?.checkedAt ?? null,
    problem: stored?.problem ?? null,
    automatic: getSetting<boolean | null>('updates.automatic', null) === true,
    decided: getSetting<boolean | null>('updates.automatic', null) !== null,
  }
}

/** Asks GitHub now and remembers the answer. Never throws. */
export async function checkForUpdate(fetcher: typeof fetch = fetch): Promise<UpdateStatus> {
  const stored: Stored = { latest: null, url: null, checkedAt: Date.now(), problem: null }
  try {
    // UPDATES_URL exists for the test suite, which must not use the network.
    const response = await fetcher(process.env.UPDATES_URL || RELEASES, {
      headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'fotobogen-update-check' },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 404) {
      stored.problem = 'No release of Fotobogen has been published yet.'
    }
    else if (!response.ok) {
      stored.problem = `GitHub could not be asked just now (it answered ${response.status}). Try again later.`
    }
    else {
      const release = await response.json() as { tag_name?: unknown, html_url?: unknown }
      const version = parseVersion(release.tag_name)
      if (!version) stored.problem = 'The latest release has a version this copy does not recognise.'
      else {
        stored.latest = version.join('.')
        // Only ever link to the project's own release pages.
        stored.url = projectPage(release.html_url)
      }
    }
  }
  catch {
    stored.problem = 'GitHub could not be reached from this server.'
  }
  setSettings({ 'updates.last': stored })
  return updateStatus()
}

let checking = false
const due = (status: UpdateStatus): boolean => status.automatic && !checking && (status.checkedAt === null || Date.now() - status.checkedAt >= DAY)

/** With automatic checks on, asks at most once a day, in the background. */
export function checkDailyIfWanted(): void {
  if (!due(updateStatus())) return
  checking = true
  void checkForUpdate().finally(() => { checking = false })
}

/**
 * Records the owner's answer. A yes checks straight away, however lately it
 * last checked, so that what the owner is then told is true at that moment.
 */
export async function setAutomatic(on: boolean): Promise<UpdateStatus> {
  setSettings({ 'updates.automatic': on })
  return on ? await checkForUpdate() : updateStatus()
}
