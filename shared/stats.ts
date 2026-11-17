// Visitor statistics: an optional counting script on the public pages.
//
// Off unless the owner chooses a service. The owner never types code: they
// give an address or an ID, each checked here, and Fotobogen writes the
// script tag itself. Nothing typed into the admin is ever run as script.

export type StatsProvider = 'off' | 'plausible' | 'google' | 'other'

export interface StatsAttribute { name: string, value: string }

export interface StatsSettings {
  provider: StatsProvider
  /** The script address Plausible gives for the site. */
  plausibleScript: string
  /** The site's domain as Plausible knows it. Only the older script (script.js) needs it. */
  plausibleDomain: string
  /** A Google Analytics measurement ID: G-XXXXXXXXXX. */
  googleId: string
  /** Any other service that is one script tag: its script's address... */
  otherScript: string
  /** ...the data- attributes its tag carries... */
  otherAttributes: StatsAttribute[]
  /** ...and the address it reports to, when that is not where the script is. */
  otherReportsTo: string
}

export const STATS_OFF: StatsSettings = { provider: 'off', plausibleScript: '', plausibleDomain: '', googleId: '', otherScript: '', otherAttributes: [], otherReportsTo: '' }

export const MAX_STATS_ATTRIBUTES = 8

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

/** A plain https address on a real host name, or null. */
function httpsAddress(value: string): URL | null {
  // Only what belongs in an address: nothing that could close an attribute or a tag.
  if (!/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,490}$/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (!url.hostname.includes('.') || /['()]/.test(value)) return null
    return url
  }
  catch {
    return null
  }
}

const NOT_AN_ADDRESS = 'Give the full address, beginning https://'

/** Checks what the admin sent. With errors, nothing should be saved. */
export function cleanStats(input: unknown): { settings: StatsSettings, errors: Record<string, string> } {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  const provider: StatsProvider = raw.provider === 'plausible' || raw.provider === 'google' || raw.provider === 'other' ? raw.provider : 'off'
  // A list of its own each time: the settings that are returned get added to.
  if (provider === 'off') return { settings: { ...STATS_OFF, otherAttributes: [] }, errors }
  const settings: StatsSettings = { ...STATS_OFF, otherAttributes: [], provider }

  if (provider === 'plausible') {
    const script = httpsAddress(text(raw.plausibleScript))
    if (script) settings.plausibleScript = script.href
    else errors.plausibleScript = `${NOT_AN_ADDRESS}. Plausible shows it where it gives you the snippet to install.`
    const domain = text(raw.plausibleDomain).toLowerCase()
    if (domain === '' || /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(,[a-z0-9]([a-z0-9.-]*[a-z0-9])?)*$/.test(domain) && domain.length <= 200) settings.plausibleDomain = domain
    else errors.plausibleDomain = 'A domain looks like photos.example.com, with no https:// in front.'
  }

  if (provider === 'google') {
    const id = text(raw.googleId).toUpperCase()
    if (/^G-[A-Z0-9]{4,20}$/.test(id)) settings.googleId = id
    else errors.googleId = 'A measurement ID looks like G-AB12CD34EF. It is under Admin, Data streams in Google Analytics.'
  }

  if (provider === 'other') {
    const script = httpsAddress(text(raw.otherScript))
    if (script) settings.otherScript = script.href
    else errors.otherScript = `${NOT_AN_ADDRESS}. It is the "src" of the script tag the service gives you.`
    const reportsTo = text(raw.otherReportsTo)
    if (reportsTo !== '') {
      const address = httpsAddress(reportsTo)
      if (address) settings.otherReportsTo = address.href
      else errors.otherReportsTo = `${NOT_AN_ADDRESS}.`
    }
    const given = (Array.isArray(raw.otherAttributes) ? raw.otherAttributes : []) as unknown[]
    for (const entry of given) {
      const name = text((entry as StatsAttribute | null)?.name).toLowerCase()
      const value = typeof (entry as StatsAttribute | null)?.value === 'string' ? (entry as StatsAttribute).value.trim() : ''
      if (name === '' && value === '') continue
      // eslint-disable-next-line no-control-regex
      if (!/^data-[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(name) || value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) {
        errors.otherAttributes = 'Each name must begin "data-" (such as data-website-id), in lowercase letters, digits, and hyphens, and each value must be one line.'
        break
      }
      if (settings.otherAttributes.some(attribute => attribute.name === name)) continue
      settings.otherAttributes.push({ name, value })
    }
    if (settings.otherAttributes.length > MAX_STATS_ATTRIBUTES) errors.otherAttributes = `At most ${MAX_STATS_ATTRIBUTES} attributes.`
  }
  return { settings, errors }
}

export interface StatsTags {
  scripts: { src: string, attributes: Record<string, string> }[]
  /** A few fixed lines some services need beside their script. Never the owner's text. */
  inline: string | null
  /** The addresses the page is then allowed to report to. */
  allow: string[]
}

/** What goes on a public page for these settings; null when statistics are off or incomplete. */
export function statsTags(settings: StatsSettings): StatsTags | null {
  if (settings.provider === 'plausible' && settings.plausibleScript) {
    return {
      scripts: [{ src: settings.plausibleScript, attributes: settings.plausibleDomain ? { 'data-domain': settings.plausibleDomain } : {} }],
      // Plausible's own two lines: a queue for the script to pick up, and the call that starts it.
      inline: 'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()',
      allow: [new URL(settings.plausibleScript).origin],
    }
  }
  if (settings.provider === 'google' && /^G-[A-Z0-9]{4,20}$/.test(settings.googleId)) {
    return {
      scripts: [{ src: `https://www.googletagmanager.com/gtag/js?id=${settings.googleId}`, attributes: {} }],
      inline: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${settings.googleId}')`,
      allow: ['https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
    }
  }
  if (settings.provider === 'other' && settings.otherScript) {
    const allow = [new URL(settings.otherScript).origin]
    if (settings.otherReportsTo && !allow.includes(new URL(settings.otherReportsTo).origin)) allow.push(new URL(settings.otherReportsTo).origin)
    return { scripts: [{ src: settings.otherScript, attributes: Object.fromEntries(settings.otherAttributes.map(attribute => [attribute.name, attribute.value])) }], inline: null, allow }
  }
  return null
}

const escapeAttribute = (value: string): string =>
  value.replace(/[&"<>]/g, character => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!)

/**
 * The tags as HTML for a page's head. They carry no nonce of their own: the
 * server gives every script tag it writes into a page that page's nonce, and
 * a tag without one is not run.
 */
export function statsHtml(tags: StatsTags): string {
  const scripts = tags.scripts.map(({ src, attributes }) =>
    `<script defer src="${escapeAttribute(src)}"${Object.entries(attributes).map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('')} data-fb-stats></script>`)
  return scripts.join('') + (tags.inline ? `<script>${tags.inline}</script>` : '')
}
