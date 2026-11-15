import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { movePhoto, placePhoto, setVisibility, updatePhoto } from '../../server/pipeline/library.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

type Ctx = ReturnType<typeof testContext>
async function add(ctx: Ctx, name: string, seed: number) {
  const tmpPath = await imageFile(join(ctx.tmpDir, `up-${seed}`), { seed, width: 60, height: 40 })
  const outcome = await acceptUpload(ctx, { tmpPath, filename: `${name}.jpg` })
  if (outcome.result !== 'accepted') throw new Error('not accepted')
  return outcome.photo.id
}
async function library() {
  const ctx = testContext()
  const ids = { a: await add(ctx, 'a', 1), b: await add(ctx, 'b', 2), c: await add(ctx, 'c', 3), d: await add(ctx, 'd', 4) }
  return { ctx, ...ids }
}
// The order visitors see: highest sort_order first, so the newest upload leads.
const order = (ctx: Ctx) => rows<{ slug: string }>(ctx, 'select slug from photos order by sort_order desc').map(row => row.slug).join('')

describe('editing a photo', () => {
  it('changes only the fields that were sent', async () => {
    const { ctx, a } = await library()
    expect(updatePhoto(ctx, a, { title: '  Harbour at dawn ', alt: 'Boats in mist' })).toEqual({ ok: true, slug: 'a' })
    expect(rows(ctx, `select title, alt, description, slug, visibility from photos where id = '${a}'`)).toEqual([
      { title: 'Harbour at dawn', alt: 'Boats in mist', description: null, slug: 'a', visibility: 'public' },
    ])
    updatePhoto(ctx, a, { description: 'Taken from the ferry.', visibility: 'hidden', takenAt: Date.parse('2024-05-03T00:00:00Z') })
    expect(rows(ctx, `select title, description, visibility, taken_at from photos where id = '${a}'`)).toEqual([
      { title: 'Harbour at dawn', description: 'Taken from the ferry.', visibility: 'hidden', taken_at: 1714694400000 },
    ])
  })
  it('clears a field given an empty value or null', async () => {
    const { ctx, a } = await library()
    updatePhoto(ctx, a, { title: 'Something', takenAt: 5 })
    updatePhoto(ctx, a, { title: '   ', takenAt: null })
    expect(rows(ctx, `select title, taken_at from photos where id = '${a}'`)).toEqual([{ title: null, taken_at: null }])
  })
  it('tidies a new address and refuses one another photo has', async () => {
    const { ctx, a } = await library()
    expect(updatePhoto(ctx, a, { slug: 'Harbour at Dawn!' })).toEqual({ ok: true, slug: 'harbour-at-dawn' })
    expect(updatePhoto(ctx, a, { slug: 'b' })).toMatchObject({ ok: false, reason: 'slug-taken', errors: { slug: expect.stringContaining('already has this address') } })
    expect(updatePhoto(ctx, a, { slug: 'harbour-at-dawn' })).toEqual({ ok: true, slug: 'harbour-at-dawn' }) // its own is fine
    expect(updatePhoto(ctx, a, { slug: '???' })).toMatchObject({ ok: false, reason: 'invalid' })
  })
  it('explains what is wrong, field by field, and changes nothing', async () => {
    const { ctx, a } = await library()
    const result = updatePhoto(ctx, a, { title: 'x'.repeat(201), alt: 42, visibility: 'secret', takenAt: 'yesterday' })
    expect(result).toEqual({ ok: false, reason: 'invalid', errors: {
      title: 'Use 200 characters or fewer.', alt: 'This must be text.', visibility: 'Choose public or hidden.', takenAt: 'This is not a date.',
    } })
    expect(rows(ctx, `select title, alt from photos where id = '${a}'`)).toEqual([{ title: null, alt: null }])
    expect(updatePhoto(ctx, 'no-such-id', { title: 'x' })).toMatchObject({ ok: false, reason: 'not-found' })
  })
})

describe('showing and hiding', () => {
  it('changes several photos at once and counts only those that changed', async () => {
    const { ctx, a, b, c } = await library()
    expect(setVisibility(ctx, [a, b, 'no-such-id'], 'hidden')).toBe(2)
    expect(setVisibility(ctx, [a, b, c], 'hidden')).toBe(1)
    expect(rows(ctx, `select count(*) as hidden from photos where visibility = 'hidden'`)).toEqual([{ hidden: 3 }])
    expect(setVisibility(ctx, [a], 'public')).toBe(1)
  })
})

describe('ordering', () => {
  it('starts with the newest upload first', async () => {
    expect(order((await library()).ctx)).toBe('dcba')
  })
  it('moves a photo up, down, to the top, and to the bottom', async () => {
    const { ctx, a, b, d } = await library()
    movePhoto(ctx, b, 'up')
    expect(order(ctx)).toBe('dbca')
    movePhoto(ctx, b, 'down')
    expect(order(ctx)).toBe('dcba')
    movePhoto(ctx, a, 'top')
    expect(order(ctx)).toBe('adcb')
    movePhoto(ctx, a, 'bottom')
    expect(order(ctx)).toBe('dcba')
    // Already at the edge: nothing changes.
    movePhoto(ctx, d, 'up')
    movePhoto(ctx, a, 'down')
    expect(order(ctx)).toBe('dcba')
    expect(movePhoto(ctx, 'no-such-id', 'up')).toBe(false)
  })
  it('drops a photo in front of another, or at the end', async () => {
    const { ctx, a, c, d } = await library()
    expect(placePhoto(ctx, a, d)).toBe(true)
    expect(order(ctx)).toBe('adcb')
    placePhoto(ctx, d, null)
    expect(order(ctx)).toBe('acbd')
    placePhoto(ctx, c, c)
    expect(order(ctx)).toBe('acbd')
    expect(placePhoto(ctx, a, 'no-such-id')).toBe(false)
    expect(placePhoto(ctx, 'no-such-id', a)).toBe(false)
    expect(order(ctx)).toBe('acbd')
  })
  it('keeps new uploads on top after reordering', async () => {
    const { ctx, a } = await library()
    movePhoto(ctx, a, 'top')
    await add(ctx, 'e', 5)
    expect(order(ctx)).toBe('eadcb')
  })
})
