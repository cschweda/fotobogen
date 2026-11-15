// Change a photo's words, address, date, or visibility. Only the fields sent are changed.
import { defineEventHandler, getRouterParam, readBody } from 'nuxt/server'
import { setPhotoAlbums, setPhotoTags } from '../../../../pipeline/collections.ts'
import { updatePhoto } from '../../../../pipeline/library.ts'
import { getPipeline } from '../../../../utils/app.ts'
import { fail } from '../../../../utils/respond.ts'
import { requireAdmin } from '../../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<Record<string, unknown>>(event).catch(() => null)
  if (!body || typeof body !== 'object') return fail(event, 422, 'Send the fields to change as JSON.')
  const id = getRouterParam(event, 'id') ?? ''
  const result = updatePhoto(getPipeline(), id, body)
  if (result.ok) {
    // "tags" is the photo's whole list of tags; "albums" the ids of every album it is in.
    const tags = Array.isArray(body.tags) ? setPhotoTags(getPipeline(), id, body.tags) : undefined
    if (Array.isArray(body.albums)) setPhotoAlbums(getPipeline(), id, body.albums.filter((album): album is string => typeof album === 'string'))
    return { ...result, tags }
  }
  if (result.reason === 'not-found') return fail(event, 404, 'There is no such photo.')
  return fail(event, result.reason === 'slug-taken' ? 409 : 422, 'Some fields need another look.', { errors: result.errors })
})
