// The job queue (DESIGN.md section 7). Jobs live in the database, so they
// survive a restart. One job runs at a time, in this process.
import type { PipelineContext } from './context.ts'
import { newId } from '../core/ids.ts'
import { processPhoto } from './render.ts'

export interface Job {
  id: string
  type: 'ingest' | 'rerender'
  photoId: string
  attempts: number
}

export interface QueueOptions {
  /** How many times a job is tried before it is marked failed. */
  maxAttempts?: number
  /** Does the work; replaced in tests. */
  run?: (ctx: PipelineContext, job: Job) => Promise<void>
  /** Told about every failed attempt, for the server log. */
  onError?: (job: Job, error: unknown) => void
}

export interface Queue {
  /** After a restart: requeue jobs that were running. Returns how many were found. */
  recover(): number
  /** Start working if not already. Safe to call at any time. */
  kick(): void
  /** Resolves when the queue has nothing left to do. */
  idle(): Promise<void>
  /** Queue a failed photo again. False when the photo is not in the failed state. */
  retry(photoId: string): boolean
  /** Jobs waiting or running. */
  depth(): number
}

const ERROR_LIMIT = 500

function runJob(ctx: PipelineContext, job: Job): Promise<void> {
  return processPhoto(ctx, job.photoId, { readMetadata: job.type === 'ingest' })
}

export function createQueue(ctx: PipelineContext, options: QueueOptions = {}): Queue {
  const { sqlite } = ctx
  const maxAttempts = options.maxAttempts ?? 3
  const run = options.run ?? runJob
  let working: Promise<void> | undefined

  function fail(job: Pick<Job, 'id' | 'photoId'>, message: string): void {
    sqlite.transaction(() => {
      sqlite.prepare(`update jobs set status = 'failed', error = ?, finished_at = ? where id = ?`)
        .run(message.slice(0, ERROR_LIMIT), Date.now(), job.id)
      sqlite.prepare(`update photos set status = 'failed', updated_at = ? where id = ? and status = 'processing'`)
        .run(Date.now(), job.photoId)
    })()
  }

  /** Claim the oldest waiting job, counting the attempt before any work is done. */
  const take = sqlite.transaction((): Job | undefined => {
    const row = sqlite.prepare(`
      select id, type, photo_id as photoId, attempts from jobs
      where status = 'queued' order by created_at, rowid limit 1
    `).get() as Job | undefined
    if (!row) return undefined
    sqlite.prepare(`update jobs set status = 'running', attempts = attempts + 1, started_at = ? where id = ?`)
      .run(Date.now(), row.id)
    return { ...row, attempts: row.attempts + 1 }
  })

  async function work(): Promise<void> {
    for (let job = take(); job; job = take()) {
      try {
        await run(ctx, job)
        sqlite.prepare(`update jobs set status = 'done', error = null, finished_at = ? where id = ?`).run(Date.now(), job.id)
      }
      catch (error) {
        options.onError?.(job, error)
        const message = error instanceof Error ? error.message : String(error)
        if (job.attempts >= maxAttempts) fail(job, message)
        else sqlite.prepare(`update jobs set status = 'queued', error = ? where id = ?`).run(message.slice(0, ERROR_LIMIT), job.id)
      }
      // Let waiting requests run between jobs.
      await new Promise(resume => setImmediate(resume))
    }
  }

  function kick(): void {
    if (working) return
    working = work().finally(() => { working = undefined })
  }

  return {
    kick,

    async idle() {
      while (working) await working
    },

    recover() {
      const interrupted = sqlite.prepare(`select id, photo_id as photoId, attempts from jobs where status = 'running'`)
        .all() as Pick<Job, 'id' | 'photoId' | 'attempts'>[]
      for (const job of interrupted) {
        // A job that keeps taking the server down with it (out of memory,
        // for example) must not be retried forever.
        if (job.attempts >= maxAttempts) fail(job, 'The server stopped while processing this photo, three times.')
        else sqlite.prepare(`update jobs set status = 'queued' where id = ?`).run(job.id)
      }
      return interrupted.length
    },

    retry(photoId) {
      const queued = sqlite.transaction(() => {
        const changed = sqlite.prepare(`update photos set status = 'processing', updated_at = ? where id = ? and status = 'failed'`)
          .run(Date.now(), photoId).changes
        if (changed === 0) return false
        sqlite.prepare(`insert into jobs (id, type, photo_id, status, attempts, created_at) values (?, 'ingest', ?, 'queued', 0, ?)`)
          .run(newId(), photoId, Date.now())
        return true
      })()
      if (queued) kick()
      return queued
    },

    depth() {
      const { depth } = sqlite.prepare(`select count(*) as depth from jobs where status in ('queued', 'running')`).get() as { depth: number }
      return depth
    },
  }
}
