import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { deletePhotos } from '../../server/pipeline/remove.ts'
import { processPhoto } from '../../server/pipeline/render.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

async function ready(ctx: ReturnType<typeof testContext>, seed: number, isSample: boolean) {
  const tmpPath = await imageFile(join(ctx.tmpDir, `up-${seed}`), { seed, width: 300, height: 200 })
  const outcome = await acceptUpload(ctx, { tmpPath, filename: `p${seed}.jpg`, isSample })
  if (outcome.result !== 'accepted') throw new Error('not accepted')
  await processPhoto(ctx, outcome.photo.id)
  return outcome.photo.id
}

describe('deletePhotos', () => {
  it('removes sample photos with their rows and files, and nothing else', async () => {
    const ctx = testContext()
    await ready(ctx, 1, true)
    await ready(ctx, 2, true)
    const mine = await ready(ctx, 3, false)
    expect(await deletePhotos(ctx, 'samples')).toEqual({ count: 2, leftBehind: [] })
    expect(rows(ctx, 'select id from photos')).toEqual([{ id: mine }])
    expect(rows(ctx, 'select distinct photo_id from derivatives')).toEqual([{ photo_id: mine }])
    expect(readdirSync(join(ctx.root, 'originals'))).toEqual([`${mine}.jpg`])
    expect(readdirSync(join(ctx.root, 'derivatives')).every(name => name.startsWith(mine))).toBe(true)
  })

  it('carries on past a file that cannot be deleted, and says which', async () => {
    const ctx = testContext()
    const first = await ready(ctx, 1, true)
    await ready(ctx, 2, true)
    const realDelete = ctx.storage.delete
    ctx.storage.delete = async (area, key) => {
      if (area === 'originals' && key === `${first}.jpg`) throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
      return realDelete(area, key)
    }
    const result = await deletePhotos(ctx, 'samples')
    expect(result).toEqual({ count: 2, leftBehind: [`originals/${first}.jpg`] })
    expect(rows(ctx, 'select id from photos')).toEqual([])
    expect(readdirSync(join(ctx.root, 'originals'))).toEqual([`${first}.jpg`])
    expect(readdirSync(join(ctx.root, 'derivatives'))).toEqual([])
  })

  it('deletes chosen photos by id and ignores ids that do not exist', async () => {
    const ctx = testContext()
    const a = await ready(ctx, 1, false)
    const b = await ready(ctx, 2, false)
    expect(await deletePhotos(ctx, { ids: [a, 'no-such-id'] })).toEqual({ count: 1, leftBehind: [] })
    expect(rows(ctx, 'select id from photos')).toEqual([{ id: b }])
  })
})
