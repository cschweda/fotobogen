// What a slideshow plays and how: every public photo, or one album's
// (?album=<slug>) or one tag's (?tag=<slug>), with the timing and order set
// in the admin.
import { createError, defineEventHandler, getQuery } from 'nuxt/server'
import { publicAlbum, publicSlides, publicTag } from '../utils/public.ts'
import { getSetting } from '../utils/settings.ts'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const missing = () => createError({ status: 404, statusText: 'Not Found', message: 'There is nothing to show.' })
  let title: string | null = null
  let back = '/'
  let slides
  if (typeof query.album === 'string') {
    const album = publicAlbum(query.album)
    if (!album) throw missing()
    title = album.title
    back = `/album/${album.slug}`
    slides = publicSlides({ album: album.id })
  }
  else if (typeof query.tag === 'string') {
    const tag = publicTag(query.tag)
    if (!tag) throw missing()
    title = tag.name
    back = `/tag/${tag.slug}`
    slides = publicSlides({ tag: tag.id })
  }
  else {
    slides = publicSlides()
  }
  return {
    title,
    /** Where "Close" leads. */
    back,
    seconds: getSetting('slideshow.seconds', 8),
    order: getSetting<'sequence' | 'random'>('slideshow.order', 'sequence'),
    slides,
  }
})
