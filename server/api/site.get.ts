// The public facts about the site, for the public pages.
import { defineEventHandler } from 'nuxt/server'
import { getSetting } from '../utils/settings.ts'

export default defineEventHandler(() => ({
  title: getSetting('site.title', ''),
  tagline: getSetting('site.tagline', ''),
}))
