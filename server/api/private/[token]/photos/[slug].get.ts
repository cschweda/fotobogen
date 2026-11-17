// One photo of a private album, for whoever has the album's link. Only a
// photo that is in that album can be reached this way.
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'
import { privateAlbum, privatePhoto } from '../../../../utils/public.ts'

export default defineEventHandler((event) => {
  const album = privateAlbum(getRouterParam(event, 'token') ?? '')
  const photo = album ? privatePhoto(album.id, getRouterParam(event, 'slug') ?? '') : null
  if (!photo) throw createError({ status: 404, statusText: 'Not Found', message: 'There is no such photo.' })
  return photo
})
