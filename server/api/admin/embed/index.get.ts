// The slideshow for other sites: whether it is switched on, and what the
// admin page needs to write the code to paste into another site.
import { defineEventHandler } from 'nuxt/server'
import { embedEnabled } from '../../../utils/embed.ts'
import { publicAlbums, publicTags, siteOrigin } from '../../../utils/public.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { getSetting } from '../../../utils/settings.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    enabled: embedEnabled(),
    /** The public site's address, which the code points at. */
    address: siteOrigin(event),
    siteTitle: getSetting('site.title', ''),
    // Only what a visitor may see: a hidden album has no slideshow to embed.
    albums: publicAlbums().map(album => ({ slug: album.slug, title: album.title })),
    tags: publicTags(),
  }
})
