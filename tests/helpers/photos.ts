// Uploading to a test server the way the admin's upload page does.
import type { TestServer } from './server.ts'

export interface ListedPhoto {
  id: string, slug: string, title: string | null, filename: string, status: string
  width: number, height: number, isSample: boolean
  thumb: { url: string, width: number, height: number } | null
  error: string | null
}

export function upload(server: TestServer, cookie: string, bytes: Uint8Array, filename: string, headers: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), filename)
  return fetch(server.url + '/api/admin/photos', {
    method: 'POST',
    headers: { origin: server.url, cookie, ...headers },
    body: form,
  })
}

export async function listPhotos(server: TestServer, cookie: string) {
  const response = await fetch(server.url + '/api/admin/photos', { headers: { cookie } })
  if (!response.ok) throw new Error(`Listing photos failed: ${response.status}`)
  return await response.json() as { counts: { total: number, samples: number, processing: number, failed: number }, photos: ListedPhoto[] }
}

/** Polls until no photo is still processing, then returns the list. */
export async function whenProcessed(server: TestServer, cookie: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const list = await listPhotos(server, cookie)
    if (list.counts.processing === 0) return list
    if (Date.now() > deadline) throw new Error(`Photos were still processing after ${timeoutMs} ms:\n${server.output()}`)
    await new Promise(wait => setTimeout(wait, 100))
  }
}
