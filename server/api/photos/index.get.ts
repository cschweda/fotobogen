// The public grid, one page at a time. Only processed, public photos.
//
// In the library's order, unless asked otherwise: ?order=random&seed=<number>
// deals the photos in a random order that is the same for every page asked
// for with that seed, which is how the front page shows a shuffle that holds
// together as more photos are loaded.
import { createError, defineEventHandler, getQuery } from 'nuxt/server'
import { publicTiles } from '../../utils/public.ts'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(query.page)) || 1))
  if (query.order === undefined || query.order === 'sequence') return { page, ...publicTiles(page) }
  if (query.order !== 'random' || typeof query.seed !== 'string' || !/^\d{1,10}$/.test(query.seed)) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'Give order=random with seed=<a whole number>, or leave both out.' })
  }
  return { page, ...publicTiles(page, undefined, Number(query.seed)) }
})
