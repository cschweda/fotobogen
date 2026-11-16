// A small rendering of the photo with a recipe that has not been saved,
// so the edit screen can show changes as the controls move.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { serial } from '../../../../core/serial.ts'
import { renderPreview } from '../../../../pipeline/render.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

// A preview decodes the photo; several at once is how a small server runs
// out of memory. They are made one at a time, and when a few are already
// waiting the next is told to ask again.
const oneAtATime = serial()
const MOST_WAITING = 4

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  if (oneAtATime.waiting >= MOST_WAITING) return fail(event, 429, 'Previews are being made. Try again in a moment.')
  const body = await readBody<{ recipe?: unknown, edge?: unknown }>(event).catch(() => null)
  let image: Buffer | null
  try {
    image = await oneAtATime(() => renderPreview(getPipeline(), getRouterParam(event, 'id') ?? '', body?.recipe ?? [], typeof body?.edge === 'number' ? body.edge : undefined))
  }
  catch (error) {
    return fail(event, 422, `The preview could not be made: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (!image) return fail(event, 404, 'There is no such photo.')
  return new Response(new Uint8Array(image), { headers: { 'content-type': 'image/webp', 'cache-control': 'no-store' } })
})
