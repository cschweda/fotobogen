// A page of the public photos that match a search: ?q=<words>&page=1.
// Every word must be found in a photo's title, description, alt text, tags,
// or the titles of its public albums. Only what a visitor can already see
// is searched or returned.
import { defineEventHandler, getQuery } from 'nuxt/server'
import { publicTiles, searchWords } from '../utils/public.ts'

export default defineEventHandler((event) => {
  const asked = getQuery(event).q
  const { query, words } = searchWords(Array.isArray(asked) ? asked[0] : asked)
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(getQuery(event).page)) || 1))
  if (words.length === 0) return { query, page: 1, total: 0, pages: 1, tiles: [] }
  return { query, page, ...publicTiles(page, { search: words }) }
})
