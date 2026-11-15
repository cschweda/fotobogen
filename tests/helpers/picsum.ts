// A local stand-in for Lorem Picsum, so tests never use the network.
import { createServer, type Server } from 'node:http'
import { imageBuffer } from './images.ts'

export interface FakePicsum {
  url: string
  requests: string[]
  /** When true, every request fails, as if the service were down. */
  down: boolean
  /** Milliseconds to wait before answering, to make a download observable. */
  slow: number
  stop(): Promise<void>
}

export async function startFakePicsum(): Promise<FakePicsum> {
  const fake: FakePicsum = { url: '', requests: [], down: false, slow: 0, stop: async () => {} }
  const server: Server = createServer(async (request, response) => {
    fake.requests.push(request.url ?? '')
    if (fake.slow) await new Promise(wait => setTimeout(wait, fake.slow))
    const image = request.url?.match(/^\/id\/(\d+)\/(\d+)\/(\d+)\.jpg$/)
    const info = request.url?.match(/^\/id\/(\d+)\/info$/)
    if (fake.down) {
      response.writeHead(503).end('down')
    }
    else if (image) {
      // Served small, whatever was asked for: the tests only need real pictures.
      const landscape = Number(image[2]) >= Number(image[3])
      const bytes = await imageBuffer({ width: landscape ? 300 : 200, height: landscape ? 200 : 300, seed: Number(image[1]) })
      response.writeHead(200, { 'content-type': 'image/jpeg' }).end(bytes)
    }
    else if (info) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: info[1], author: `Author ${info[1]}` }))
    }
    else {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
  fake.url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  fake.stop = () => new Promise(closed => server.close(() => closed()))
  return fake
}
