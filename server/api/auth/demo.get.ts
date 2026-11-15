// Whether this site offers a demo login, so the login page can say so.
import { defineEventHandler } from 'nuxt/server'
import { DEMO_PASSWORD, DEMO_USERNAME, demoModeOn } from '../../utils/demo.ts'

export default defineEventHandler(() => demoModeOn() ? { enabled: true, username: DEMO_USERNAME, password: DEMO_PASSWORD } : { enabled: false })
