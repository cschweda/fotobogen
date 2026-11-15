import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { addTag, addToAlbum, cleanTag, createAlbum, deleteAlbum, removeFromAlbum, setPhotoAlbums, setPhotoTags, updateAlbum } from '../../server/pipeline/collections.ts'
import { deletePhotos } from '../../server/pipeline/remove.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

type Ctx = ReturnType<typeof testContext>
async function add(ctx: Ctx, seed: number) {
  const tmpPath = await imageFile(join(ctx.tmpDir, `up-${seed}`), { seed, width: 60, height: 40 })
  const outcome = await acceptUpload(ctx, { tmpPath, filename: `p${seed}.jpg` })
  if (outcome.result !== 'accepted') throw new Error('not accepted')
  return outcome.photo.id
}
const members = (ctx: Ctx, albumId: string) => rows<{ slug: string }>(ctx, `select p.slug from album_photos ap join photos p on p.id = ap.photo_id where ap.album_id = '${albumId}' order by ap.position`).map(row => row.slug).join(',')
const tagNames = (ctx: Ctx) => rows<{ name: string }>(ctx, 'select name from tags order by name').map(row => row.name)

describe('albums', () => {
  it('are created with an address made from the name', async () => {
    const ctx = testContext()
    expect(createAlbum(ctx, { title: '  Summer in Lisbon ', description: 'Two weeks in July.' })).toMatchObject({ ok: true, slug: 'summer-in-lisbon' })
    expect(createAlbum(ctx, { title: 'Summer in Lisbon' })).toMatchObject({ ok: true, slug: 'summer-in-lisbon-2' })
    expect(rows(ctx, 'select title, description, visibility, sort_order from albums order by sort_order')).toEqual([
      { title: 'Summer in Lisbon', description: 'Two weeks in July.', visibility: 'public', sort_order: 1 },
      { title: 'Summer in Lisbon', description: null, visibility: 'public', sort_order: 2 },
    ])
  })
  it('need a name', () => {
    const ctx = testContext()
    expect(createAlbum(ctx, { title: '   ' })).toEqual({ ok: false, reason: 'invalid', errors: { title: 'Give the album a name.' } })
    expect(createAlbum(ctx, { title: 'x'.repeat(121) })).toMatchObject({ ok: false, errors: { title: 'Use 120 characters or fewer.' } })
  })
  it('hold photos in the order they were added, each only once', async () => {
    const ctx = testContext()
    const [a, b, c] = [await add(ctx, 1), await add(ctx, 2), await add(ctx, 3)]
    const album = createAlbum(ctx, { title: 'Trip' }) as { id: string }
    expect(addToAlbum(ctx, album.id, [b, a])).toBe(2)
    expect(addToAlbum(ctx, album.id, [a, c, 'no-such-photo'])).toBe(1)
    expect(members(ctx, album.id)).toBe('p2,p1,p3')
    expect(removeFromAlbum(ctx, album.id, [a])).toBe(1)
    expect(members(ctx, album.id)).toBe('p2,p3')
    expect(addToAlbum(ctx, 'no-such-album', [a])).toBeNull()
  })
  it('can be renamed, hidden, re-addressed, and given a cover from their own photos', async () => {
    const ctx = testContext()
    const [a, b] = [await add(ctx, 1), await add(ctx, 2)]
    const album = createAlbum(ctx, { title: 'Trip' }) as { id: string }
    const other = createAlbum(ctx, { title: 'Other' }) as { id: string }
    addToAlbum(ctx, album.id, [a])
    expect(updateAlbum(ctx, album.id, { title: 'The Trip', visibility: 'hidden', slug: 'Big Trip!', coverPhotoId: a })).toEqual({ ok: true, id: album.id, slug: 'big-trip' })
    expect(rows(ctx, `select title, visibility, slug, cover_photo_id from albums where id = '${album.id}'`)).toEqual([{ title: 'The Trip', visibility: 'hidden', slug: 'big-trip', cover_photo_id: a }])
    expect(updateAlbum(ctx, album.id, { coverPhotoId: b })).toMatchObject({ ok: false, errors: { coverPhotoId: 'The cover must be a photo in this album.' } })
    expect(updateAlbum(ctx, album.id, { slug: 'other' })).toMatchObject({ ok: false, reason: 'slug-taken' })
    expect(updateAlbum(ctx, other.id, { slug: 'other' })).toMatchObject({ ok: true })
    expect(updateAlbum(ctx, 'nope', { title: 'x' })).toMatchObject({ ok: false, reason: 'not-found' })
  })
  it('leave the photos alone when deleted, and lose a photo that is deleted', async () => {
    const ctx = testContext()
    const [a, b] = [await add(ctx, 1), await add(ctx, 2)]
    const album = createAlbum(ctx, { title: 'Trip' }) as { id: string }
    addToAlbum(ctx, album.id, [a, b])
    updateAlbum(ctx, album.id, { coverPhotoId: a })
    await deletePhotos(ctx, { ids: [a] })
    expect(members(ctx, album.id)).toBe('p2')
    expect(rows(ctx, 'select cover_photo_id from albums')).toEqual([{ cover_photo_id: null }])
    expect(deleteAlbum(ctx, album.id)).toBe(true)
    expect(deleteAlbum(ctx, album.id)).toBe(false)
    expect(rows(ctx, 'select count(*) as n from photos')).toEqual([{ n: 1 }])
    expect(rows(ctx, 'select count(*) as n from album_photos')).toEqual([{ n: 0 }])
  })
  it('can be set for one photo in a single step', async () => {
    const ctx = testContext()
    const a = await add(ctx, 1)
    const [one, two, three] = ['One', 'Two', 'Three'].map(title => (createAlbum(ctx, { title }) as { id: string }).id)
    setPhotoAlbums(ctx, a, [one!, two!])
    setPhotoAlbums(ctx, a, [two!, three!, 'no-such-album'])
    expect(rows<{ title: string }>(ctx, `select al.title from album_photos ap join albums al on al.id = ap.album_id order by al.title`).map(row => row.title)).toEqual(['Three', 'Two'])
  })
})

describe('tags', () => {
  it('are tidied as they are typed', () => {
    expect(cleanTag('  Black   and  White ')).toEqual({ name: 'Black and White', slug: 'black-and-white' })
    expect(cleanTag('#street')).toEqual({ name: 'street', slug: 'street' })
    expect(cleanTag('x'.repeat(60))!.name).toHaveLength(40)
    expect(cleanTag('   ')).toBeNull()
    expect(cleanTag('!!!')).toBeNull()
    expect(cleanTag(42)).toBeNull()
  })
  it('are set for a photo as a whole list, counting two spellings once', async () => {
    const ctx = testContext()
    const a = await add(ctx, 1)
    expect(setPhotoTags(ctx, a, ['Sea', 'street', 'sea', '  ', 'Night'])).toEqual(['Night', 'Sea', 'street'])
    expect(setPhotoTags(ctx, a, ['street'])).toEqual(['street'])
    expect(tagNames(ctx)).toEqual(['street']) // tags nobody carries are gone
  })
  it('keep the spelling they were first given', async () => {
    const ctx = testContext()
    const [a, b] = [await add(ctx, 1), await add(ctx, 2)]
    setPhotoTags(ctx, a, ['Lisbon'])
    expect(setPhotoTags(ctx, b, ['LISBON'])).toEqual(['Lisbon'])
    expect(tagNames(ctx)).toEqual(['Lisbon'])
  })
  it('can be added to several photos at once', async () => {
    const ctx = testContext()
    const [a, b] = [await add(ctx, 1), await add(ctx, 2)]
    setPhotoTags(ctx, a, ['sea'])
    expect(addTag(ctx, [a, b, 'no-such-photo'], 'Sea')).toBe(1)
    expect(addTag(ctx, [a], '???')).toBeNull()
    expect(rows(ctx, 'select count(*) as n from photo_tags')).toEqual([{ n: 2 }])
  })
  it('disappear with the last photo that had them', async () => {
    const ctx = testContext()
    const a = await add(ctx, 1)
    setPhotoTags(ctx, a, ['sea'])
    await deletePhotos(ctx, { ids: [a] })
    expect(tagNames(ctx)).toEqual([])
  })
  it('are capped at thirty a photo', async () => {
    const ctx = testContext()
    const a = await add(ctx, 1)
    expect(setPhotoTags(ctx, a, Array.from({ length: 50 }, (_, index) => `tag ${index}`))).toHaveLength(30)
  })
})
