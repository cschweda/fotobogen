// One public album and a page of its photos, in the album's own order.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'
import { publicAlbum, publicTiles } from '../../utils/public.ts'

export default defineEventHandler((event) => {
  const album = publicAlbum(getRouterParam(event, 'slug') ?? '')
  if (!album) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such album.' })
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(getQuery(event).page)) || 1))
  const { id, ...shown } = album
  return { album: shown, page, ...publicTiles(page, { album: id }) }
})
