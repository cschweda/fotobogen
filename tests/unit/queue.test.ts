import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptUpload } from '../../server/pipeline/accept.ts'
import { createQueue } from '../../server/pipeline/queue.ts'
import { imageFile } from '../helpers/images.ts'
import { rows, testContext } from '../helpers/pipeline.ts'

type Ctx = ReturnType<typeof testContext>

async function upload(ctx: Ctx, seed: number) {
  const tmpPath = await imageFile(join(ctx.tmpDir, `up-${seed}`), { seed, width: 200, height: 150 })
  const outcome = await acceptUpload(ctx, { tmpPath, filename: `photo-${seed}.jpg` })
  if (outcome.result !== 'accepted') throw new Error('not accepted')
  return outcome.photo.id
}
const jobs = (ctx: Ctx) => rows<{ photo_id: string, status: string, attempts: number, error: string | null }>(
  ctx, 'select photo_id, status, attempts, error from jobs order by created_at, rowid')
const statuses = (ctx: Ctx) => rows<{ status: string }>(ctx, 'select status from photos order by sort_order').map(r => r.status)

describe('the job queue', () => {
  it('processes queued photos until none are left', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    await upload(ctx, 2)
    const queue = createQueue(ctx)
    expect(queue.depth()).toBe(2)
    queue.kick()
    await queue.idle()
    expect(statuses(ctx)).toEqual(['ready', 'ready'])
    expect(jobs(ctx).map(j => [j.status, j.attempts])).toEqual([['done', 1], ['done', 1]])
    expect(queue.depth()).toBe(0)
  })

  it('runs one job at a time, oldest first', async () => {
    const ctx = testContext()
    const first = await upload(ctx, 1)
    const second = await upload(ctx, 2)
    const order: string[] = []
    let running = 0
    let most = 0
    const queue = createQueue(ctx, {
      run: async (_ctx, job) => {
        running++
        most = Math.max(most, running)
        order.push(job.photoId)
        await new Promise(done => setTimeout(done, 10))
        running--
      },
    })
    queue.kick()
    queue.kick() // a second kick while running must not start a second worker
    await queue.idle()
    expect(order).toEqual([first, second])
    expect(most).toBe(1)
  })

  it('tries a failing job three times, then marks it and the photo failed with the error', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    await upload(ctx, 2)
    let calls = 0
    const queue = createQueue(ctx, {
      run: async (_ctx, job) => {
        calls++
        if (job.photoId === rows<{ id: string }>(ctx, 'select id from photos order by sort_order')[0]!.id) {
          throw new Error('the disk is full')
        }
      },
    })
    queue.kick()
    await queue.idle()
    expect(calls).toBe(4) // three for the failing photo, one for the other
    expect(jobs(ctx).map(j => [j.status, j.attempts, j.error])).toEqual([
      ['failed', 3, 'the disk is full'], ['done', 1, null],
    ])
    expect(statuses(ctx)).toEqual(['failed', 'processing']) // the fake runner does not mark photos ready
  })

  it('requeues a job that was running when the server stopped', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    ctx.sqlite.prepare(`update jobs set status = 'running', attempts = 1, started_at = 1`).run()
    const queue = createQueue(ctx)
    expect(queue.recover()).toBe(1)
    expect(jobs(ctx).map(j => [j.status, j.attempts])).toEqual([['queued', 1]])
    queue.kick()
    await queue.idle()
    expect(jobs(ctx).map(j => [j.status, j.attempts])).toEqual([['done', 2]])
    expect(statuses(ctx)).toEqual(['ready'])
  })

  it('gives up on a job that has already stopped the server three times', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    ctx.sqlite.prepare(`update jobs set status = 'running', attempts = 3`).run()
    const queue = createQueue(ctx)
    queue.recover()
    expect(jobs(ctx).map(j => [j.status, j.attempts])).toEqual([['failed', 3]])
    expect(jobs(ctx)[0]!.error).toMatch(/stopped/)
    expect(statuses(ctx)).toEqual(['failed'])
  })

  it('retries a failed photo on request', async () => {
    const ctx = testContext()
    const id = await upload(ctx, 1)
    let fail = true
    const queue = createQueue(ctx, { run: async () => { if (fail) throw new Error('nope') } })
    queue.kick()
    await queue.idle()
    expect(statuses(ctx)).toEqual(['failed'])
    fail = false
    expect(queue.retry(id)).toBe(true)
    expect(statuses(ctx)).toEqual(['processing'])
    await queue.idle()
    expect(jobs(ctx).map(j => j.status)).toEqual(['failed', 'done'])
    expect(queue.retry(id)).toBe(false) // not failed any more
    expect(queue.retry('no-such-id')).toBe(false)
  })

  it('survives the database refusing to record an outcome, and picks the job up again later', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    const reported: string[] = []
    let breakIt = true
    const queue = createQueue(ctx, {
      onError: (_job, error) => reported.push(String((error as Error).message)),
      run: async () => {
        // Stands in for a full disk: the next statement the queue runs fails.
        if (breakIt) ctx.sqlite.exec('alter table jobs rename to jobs_away')
      },
    })
    queue.kick()
    await queue.idle() // resolves; nothing is thrown into the void
    expect(reported.join(' ')).toMatch(/no such table/)

    ctx.sqlite.exec('alter table jobs_away rename to jobs')
    breakIt = false
    expect(jobs(ctx).map(j => j.status)).toEqual(['running']) // stranded for now
    queue.kick()
    await queue.idle()
    expect(jobs(ctx).map(j => [j.status, j.attempts])).toEqual([['done', 2]])
  })

  it('reports how many times it tried when giving up after a restart', async () => {
    const ctx = testContext()
    await upload(ctx, 1)
    ctx.sqlite.prepare(`update jobs set status = 'running', attempts = 2`).run()
    createQueue(ctx, { maxAttempts: 2 }).recover()
    expect(jobs(ctx)[0]!.error).toBe('The server stopped while processing this photo, 2 times.')
  })
})
