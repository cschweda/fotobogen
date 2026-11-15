import { mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { choosePort, isPortFree, planStart, registerInstance, runningInstances, type Instance } from '../../server/core/instances.ts'

const home = () => mkdtempSync(join(tmpdir(), 'fb-home-'))
const other = (port: number, dataDir: string): Instance => ({ pid: 4242, port, dataDir: resolve(dataDir), startedAt: 1 })

describe('choosing a port', () => {
  const taken = (...ports: number[]) => async (port: number) => !ports.includes(port)

  it('uses 5150 when it is free', async () => {
    expect(await choosePort(5150, false, '0.0.0.0', 10, taken())).toEqual({ port: 5150, moved: false })
  })
  it('moves up to the next free port when the default is taken', async () => {
    expect(await choosePort(5150, false, '0.0.0.0', 10, taken(5150))).toEqual({ port: 5151, moved: true })
    expect(await choosePort(5150, false, '0.0.0.0', 10, taken(5150, 5151, 5152))).toEqual({ port: 5153, moved: true })
  })
  it('gives up with a clear message when the whole range is taken', async () => {
    expect(await choosePort(5150, false, '0.0.0.0', 3, taken(5150, 5151, 5152))).toEqual({ error: 'Ports 5150 to 5152 are all in use. Set PORT in .env to a free port.' })
  })
  it('never moves a port the owner chose', async () => {
    expect(await choosePort(8088, true, '0.0.0.0', 10, taken())).toEqual({ port: 8088, moved: false })
    expect(await choosePort(8088, true, '0.0.0.0', 10, taken(8088))).toEqual({ error: 'Port 8088 is already in use. Choose another PORT in .env, or stop whatever is using it.' })
  })
  it('can tell a port in use from a free one', async () => {
    const server = createServer()
    await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
    const { port } = server.address() as { port: number }
    expect(await isPortFree(port, '127.0.0.1')).toBe(false)
    await new Promise(closed => server.close(closed))
    expect(await isPortFree(port, '127.0.0.1')).toBe(true)
  })
})

describe('other copies already running', () => {
  it('starts straight away when there are none', () => {
    expect(planStart([], './data', true)).toEqual({ action: 'start' })
  })
  it('asks, when someone is there to answer', () => {
    const running = [other(5150, '/srv/a/data')]
    expect(planStart(running, '/srv/b/data', true)).toEqual({ action: 'ask', sameData: [], others: running })
    expect(planStart(running, '/srv/a/data', true)).toEqual({ action: 'ask', sameData: running, others: [] })
  })
  it('runs beside a different site when nobody is there to ask', () => {
    expect(planStart([other(5150, '/srv/a/data')], '/srv/b/data', false)).toEqual({ action: 'start' })
  })
  it('refuses to share a data directory with a running copy', () => {
    const plan = planStart([other(5150, '/srv/a/data')], '/srv/a/data', false)
    expect(plan.action).toBe('refuse')
    expect((plan as { message: string }).message).toContain('already running with this data directory')
    expect((plan as { message: string }).message).toContain('port 5150')
  })
})

describe('the record of running copies', () => {
  it('lists other live copies, and forgets ones that have stopped', () => {
    const dir = home()
    mkdirSync(join(dir, '.fotobogen', 'instances'), { recursive: true })
    const write = (name: string, instance: unknown) => writeFileSync(join(dir, '.fotobogen', 'instances', name), JSON.stringify(instance))
    write('alive.json', { pid: process.ppid, port: 5150, dataDir: '/srv/a/data', startedAt: 5 }) // the test runner: certainly alive
    write('dead.json', { pid: 2 ** 22 + 12345, port: 5151, dataDir: '/srv/b/data', startedAt: 6 })
    writeFileSync(join(dir, '.fotobogen', 'instances', 'junk.json'), '{ not json')
    expect(runningInstances(dir)).toEqual([{ pid: process.ppid, port: 5150, dataDir: '/srv/a/data', startedAt: 5 }])
    expect(readdirSync(join(dir, '.fotobogen', 'instances'))).toEqual(['alive.json'])
  })
  it('records this copy, leaves itself out of the list, and removes the record on request', () => {
    const dir = home()
    const unregister = registerInstance({ port: 5150, dataDir: './data' }, dir)
    expect(readdirSync(join(dir, '.fotobogen', 'instances'))).toEqual([`${process.pid}.json`])
    expect(runningInstances(dir)).toEqual([])
    unregister()
    expect(readdirSync(join(dir, '.fotobogen', 'instances'))).toEqual([])
  })
  it('does not fail when the home directory cannot be written', () => {
    const file = join(home(), 'a-file')
    writeFileSync(file, 'x')
    expect(() => registerInstance({ port: 5150, dataDir: './data' }, file)()).not.toThrow()
    expect(runningInstances(file)).toEqual([])
  })
})
