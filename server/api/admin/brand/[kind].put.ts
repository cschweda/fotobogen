// Upload the site's icon, or its logo for light or dark mode. The body of
// the request is the picture itself.
import { defineEventHandler, getRequestHeader, getRouterParam } from 'nuxt/server'
import { BRAND_KINDS, BRAND_MAX_BYTES, BrandError, type BrandKind, publicBrand, storeBrandImage } from '../../../utils/brand.ts'
import { fail } from '../../../utils/respond.ts'
import { requireAdmin } from '../../../utils/session.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const kind = getRouterParam(event, 'kind') as BrandKind
  if (!BRAND_KINDS.includes(kind)) return fail(event, 404, 'There is no such picture to set.')
  const tooLarge = () => fail(event, 413, 'That file is larger than 5 MB. An icon or logo should be far smaller; save a smaller copy and try again.')
  // Refused by its declared size before any of it is read.
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > BRAND_MAX_BYTES) return tooLarge()

  // Read piece by piece, stopping as soon as it is too large, whatever size was declared.
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = event.req.body?.getReader()
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > BRAND_MAX_BYTES) {
      await reader.cancel()
      return tooLarge()
    }
    chunks.push(value)
  }
  if (total === 0) return fail(event, 422, 'Choose a picture to upload.')
  try {
    return { meta: await storeBrandImage(kind, Buffer.concat(chunks)), shown: publicBrand() }
  }
  catch (error) {
    if (error instanceof BrandError) return fail(event, 422, error.message)
    throw error
  }
})
