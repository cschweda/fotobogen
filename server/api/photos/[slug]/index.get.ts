// One public photo: its words, its larger copies, and its neighbours.
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { publicPhoto } from '../../../utils/public.ts'

export default defineEventHandler((event) => {
  const photo = publicPhoto(getRouterParam(event, 'slug') ?? '')
  if (!photo) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such photo.' })
  return photo
})
