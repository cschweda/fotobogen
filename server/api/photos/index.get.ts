// The public grid, one page at a time. Only processed, public photos.
import { defineEventHandler, getQuery } from 'nuxt/server'
import { publicTiles } from '../../utils/public.ts'

export default defineEventHandler((event) => {
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(getQuery(event).page)) || 1))
  return { page, ...publicTiles(page) }
})
