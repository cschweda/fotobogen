// A private album, for whoever has its link: the album, then a page of its
// photos in the album's order, in the same shape as the public lists.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'
import { privateAlbum, publicTiles } from '../../../utils/public.ts'

export default defineEventHandler((event) => {
  const album = privateAlbum(getRouterParam(event, 'token') ?? '')
  if (!album) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such album.' })
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(getQuery(event).page)) || 1))
  return { album: { title: album.title, description: album.description, count: album.count }, page, ...publicTiles(page, { privateAlbum: album.id }) }
})
