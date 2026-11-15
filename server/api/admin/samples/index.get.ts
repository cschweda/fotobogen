// How the sample-photo download is going, and how many samples are in the library.
import { defineEventHandler } from 'nuxt/server'
import { requireAdmin } from '../../../utils/session.ts'
import { sampleStatus, samplesInLibrary } from '../../../utils/samples.ts'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { ...sampleStatus(), inLibrary: samplesInLibrary() }
})
