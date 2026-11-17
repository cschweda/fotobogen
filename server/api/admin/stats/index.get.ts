// Visitor statistics: which counting service, if any, the public pages load.
import { defineEventHandler } from 'nuxt/server'
import { MAX_STATS_ATTRIBUTES } from '../../../../shared/stats.ts'
import { requireAdmin } from '../../../utils/session.ts'
import { statsSettings } from '../../../utils/stats.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { settings: statsSettings(), maxAttributes: MAX_STATS_ATTRIBUTES }
})
