// One tag and a page of the public photos that carry it.
import { createError, defineEventHandler, getQuery, getRouterParam } from 'nuxt/server'
import { publicTag, publicTiles } from '../../utils/public.ts'

export default defineEventHandler((event) => {
  const tag = publicTag(getRouterParam(event, 'slug') ?? '')
  if (!tag) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such tag.' })
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(getQuery(event).page)) || 1))
  return { tag: { slug: tag.slug, name: tag.name }, page, ...publicTiles(page, { tag: tag.id }) }
})
