// One page a visitor may read: its title and its text. The text is plain
// text with a little marking (shared/page-text.ts); the page draws it.
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { publicPage } from '../../utils/pages.ts'

export default defineEventHandler((event) => {
  const page = publicPage(getRouterParam(event, 'slug') ?? '')
  if (!page) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such page.' })
  return { slug: page.slug, title: page.title, body: page.body }
})
