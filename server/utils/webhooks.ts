// Webhooks: when something happens to a photo, Fotobogen can tell another
// program by sending it a small JSON message (docs/WEBHOOKS.md).
import { createHmac, randomBytes } from 'node:crypto'
import { resolveSettings } from '../core/config.ts'
import { newId } from '../core/ids.ts'
import { checkWebhookAddress, parseWebhookUrl, postJson } from '../core/webhook-address.ts'
import { getSetting, setSettings } from './settings.ts'

export const EVENTS = ['photo.uploaded', 'photo.published', 'photo.deleted'] as const
export type WebhookEvent = typeof EVENTS[number] | 'test'

export interface Webhook {
  id: string
  url: string
  events: string[]
  /** Signs every message, so the receiver can tell it came from this site. */
  secret: string
  createdAt: number
}
export interface Delivery { at: number, event: string, ok: boolean, detail: string }

const TIMEOUT_MS = 10_000
// Tried again after these waits when the receiver does not answer with success.
const RETRY_AFTER_MS = [5_000, 30_000]
const MAX_HOOKS = 10
const last = new Map<string, Delivery>()

export const listWebhooks = (): Webhook[] => getSetting<Webhook[]>('webhooks.list', [])
export const lastDelivery = (id: string): Delivery | null => last.get(id) ?? null
const allowPrivate = (): boolean => resolveSettings(process.env).webhooksAllowPrivate

export async function addWebhook(url: unknown, events: unknown): Promise<{ ok: true, webhook: Webhook } | { ok: false, errors: Record<string, string> }> {
  const hooks = listWebhooks()
  const errors: Record<string, string> = {}
  const address = await checkWebhookAddress(url, allowPrivate())
  if (!address.ok) errors.url = address.message
  const chosen = Array.isArray(events) ? EVENTS.filter(event => events.includes(event)) : []
  if (chosen.length === 0) errors.events = 'Choose at least one thing to be told about.'
  if (hooks.length >= MAX_HOOKS) errors.url = `There can be at most ${MAX_HOOKS} webhooks. Delete one first.`
  if (Object.keys(errors).length > 0 || !address.ok) return { ok: false, errors }
  const webhook: Webhook = { id: newId(), url: address.url.toString(), events: chosen, secret: randomBytes(24).toString('base64url'), createdAt: Date.now() }
  setSettings({ 'webhooks.list': [...hooks, webhook] })
  return { ok: true, webhook }
}

export function removeWebhook(id: string): boolean {
  const hooks = listWebhooks()
  if (!hooks.some(hook => hook.id === id)) return false
  setSettings({ 'webhooks.list': hooks.filter(hook => hook.id !== id) })
  last.delete(id)
  return true
}

/** One attempt. The receiver's answer is reduced to its status; its body is never read. */
async function send(hook: Webhook, body: string): Promise<Delivery> {
  const event = (JSON.parse(body) as { event: string }).event
  const result = (ok: boolean, detail: string): Delivery => ({ at: Date.now(), event, ok, detail })
  const parsed = parseWebhookUrl(hook.url)
  if (!parsed.ok) return result(false, parsed.message)
  // postJson resolves the name itself and connects only to what it resolved,
  // refusing private addresses there, so the check cannot be sidestepped by
  // a name that changes where it points.
  const outcome = await postJson(parsed.url, {
    'content-type': 'application/json',
    'user-agent': 'fotobogen-webhook',
    'x-fotobogen-event': event,
    'x-fotobogen-signature': `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}`,
  }, body, { allowPrivate: allowPrivate(), timeoutMs: TIMEOUT_MS })
  if ('refused' in outcome) return result(false, outcome.refused)
  if ('failed' in outcome) return result(false, outcome.failed === 'timeout' ? 'Did not answer within 10 seconds' : 'Could not be reached')
  return result(outcome.status >= 200 && outcome.status < 300, `Answered ${outcome.status}`)
}

async function deliver(hook: Webhook, body: string, attempt = 0): Promise<Delivery> {
  const delivery = await send(hook, body)
  last.set(hook.id, delivery)
  const wait = RETRY_AFTER_MS[attempt]
  if (!delivery.ok && wait !== undefined) {
    const timer = setTimeout(() => { void deliver(hook, body, attempt + 1) }, wait)
    timer.unref()
  }
  return delivery
}

export interface PhotoEvent {
  slug: string
  title: string | null
  /** The photo's page on this site, without the site's own address: /photo/<slug>. */
  path: string
  /** Its 1280 px copy, likewise relative; null when there is none (a deleted photo). */
  image: string | null
}

/** Tells every webhook that asked about this event. Returns at once; delivery happens in the background. */
export function notify(event: typeof EVENTS[number], photo: PhotoEvent): void {
  const hooks = listWebhooks().filter(hook => hook.events.includes(event))
  if (hooks.length === 0) return
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), site: getSetting('site.title', ''), photo })
  for (const hook of hooks) void deliver(hook, body)
}

/** Sends a test message to one webhook now and reports how it went. */
export async function sendTest(id: string): Promise<Delivery | null> {
  const hook = listWebhooks().find(candidate => candidate.id === id)
  if (!hook) return null
  const delivery = await send(hook, JSON.stringify({ event: 'test', sentAt: new Date().toISOString(), site: getSetting('site.title', ''), photo: null }))
  last.set(hook.id, delivery)
  return delivery
}
