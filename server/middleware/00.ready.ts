// Hold every request until boot (including migrations) has finished.
import { defineEventHandler } from 'nuxt/server'
import { whenReady } from '../utils/app.ts'

export default defineEventHandler(async () => {
  await whenReady()
})
