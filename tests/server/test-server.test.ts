// The helper every server test starts from. Test files run side by side and each asks the system for
// a free port, so now and then two are handed the same one. The helper must never give a test a
// server that is not its own: that test would send its setup token to a stranger and be refused.
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer, type TestServer } from '../helpers/server.ts'

describe('the test server helper', () => {
  let other: ReturnType<typeof createServer> | undefined
  let started: TestServer | undefined

  afterEach(async () => {
    await started?.stop()
    started = undefined
    await new Promise(done => other ? other.close(done) : done(null))
    other = undefined
  })

  it('does not mistake another server on its port for its own', async () => {
    // Something else already answers on the port, health check included.
    other = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}') })
    const port = await new Promise<number>(done => other!.listen(0, '127.0.0.1', () => done((other!.address() as { port: number }).port)))

    const outcome = await startServer({ port }).then(server => { started = server; return 'started' }, error => String(error))
    expect(outcome).toContain('Server exited early')
    expect(outcome).toContain('EADDRINUSE')
  })

  it('has read the setup token by the time it hands the server over', async () => {
    started = await startServer()
    expect(started.token()).toMatch(/^[0-9a-f]{32}$/)
    expect(started.output()).toContain(`Listening on http://127.0.0.1:${new URL(started.url).port}`)
  })
})
