// The public albums, each with its cover and how many photos it holds.
import { defineEventHandler } from 'nuxt/server'
import { publicAlbums } from '../../utils/public.ts'

export default defineEventHandler(() => ({
  albums: publicAlbums().map(({ id: _id, ...album }) => album),
}))
