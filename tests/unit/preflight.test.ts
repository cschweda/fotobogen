import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluate, formatReport, gatherFacts, passed, pm2State, type Facts } from '../../server/core/preflight.ts'

const good: Facts = {
  nodeVersion: '24.22.3', platform: 'linux', arch: 'x64',
  linux: { id: 'ubuntu', like: ['debian'], name: 'Ubuntu 26.04 LTS' },
  memoryMb: 2048, swapMb: 2048, dataDir: '/srv/fotobogen/data', freeDiskMb: 20_000,
  dataDirProblem: null, imageProblem: null, databaseProblem: null,
}
const find = (facts: Partial<Facts>, title: string) => evaluate({ ...good, ...facts }).find(check => check.title === title)!

describe('the preflight check', () => {
  it('passes a healthy Ubuntu server with nothing to fix', () => {
    const checks = evaluate(good)
    expect(checks.every(check => check.level === 'ok')).toBe(true)
    expect(passed(checks)).toBe(true)
    expect(checks.map(check => check.title)).toEqual(['Node.js', 'Operating system', 'Processor', 'Memory', 'Data directory', 'Disk space', 'Image library', 'Database library'])
  })

  it('passes macOS and Windows', () => {
    expect(find({ platform: 'darwin', linux: null, swapMb: null }, 'Operating system')).toMatchObject({ level: 'ok', detail: 'macOS' })
    expect(find({ platform: 'win32', linux: null, swapMb: null }, 'Operating system')).toMatchObject({ level: 'ok', detail: 'Windows' })
    expect(passed(evaluate({ ...good, platform: 'win32', linux: null, swapMb: null, memoryMb: 1024 }))).toBe(true)
  })

  it('stops on a Node that is too old, and says which to install', () => {
    const check = find({ nodeVersion: '22.11.0' }, 'Node.js')
    expect(check.level).toBe('fail')
    expect(check.fix).toContain('Install Node 24 or later')
    expect(passed(evaluate({ ...good, nodeVersion: '22.11.0' }))).toBe(false)
  })

  it('stops on a machine with too little memory', () => {
    const check = find({ memoryMb: 512 }, 'Memory')
    expect(check).toMatchObject({ level: 'fail', detail: '0.5 GB available' })
    expect(check.fix).toContain('at least 1 GB')
  })

  it('lets a 1 GB server run, and recommends swap when it has none', () => {
    expect(find({ memoryMb: 957, swapMb: 0 }, 'Memory')).toMatchObject({ level: 'warn' })
    expect(find({ memoryMb: 957, swapMb: 0 }, 'Memory').fix).toContain('swap')
    expect(find({ memoryMb: 957, swapMb: 2048 }, 'Memory').level).toBe('ok')
    expect(passed(evaluate({ ...good, memoryMb: 957, swapMb: 0 }))).toBe(true)
  })

  it('warns, without stopping, on a Linux it is not tested on', () => {
    const fedora = find({ linux: { id: 'fedora', like: [], name: 'Fedora Linux 43' } }, 'Operating system')
    expect(fedora).toMatchObject({ level: 'warn', detail: 'Fedora Linux 43 is not a tested Linux' })
    // Based on Debian or Ubuntu counts as tested.
    expect(find({ linux: { id: 'linuxmint', like: ['ubuntu', 'debian'], name: 'Linux Mint 22' } }, 'Operating system').level).toBe('ok')
    expect(find({ platform: 'freebsd', linux: null }, 'Operating system').level).toBe('warn')
  })

  it('stops on a processor the libraries are not built for', () => {
    expect(find({ arch: 'arm' }, 'Processor').level).toBe('fail')
    expect(find({ arch: 'arm64' }, 'Processor').level).toBe('ok')
  })

  it('stops when the disk is nearly full, and warns when it soon will be', () => {
    expect(find({ freeDiskMb: 200 }, 'Disk space')).toMatchObject({ level: 'fail', detail: '200 MB free' })
    expect(find({ freeDiskMb: 1500 }, 'Disk space').level).toBe('warn')
  })

  it('stops when the data directory cannot be written, or a library does not load', () => {
    expect(find({ dataDirProblem: 'EACCES: permission denied' }, 'Data directory')).toMatchObject({ level: 'fail' })
    expect(find({ imageProblem: 'the image library (sharp) did not load: boom' }, 'Image library').fix).toContain('pnpm install')
    expect(find({ databaseProblem: 'nope' }, 'Database library').level).toBe('fail')
  })

  it('says whether pm2 is there, without ever stopping or warning over it', () => {
    // Not looked for (Docker): no line at all.
    expect(find({ pm2: null }, 'pm2')).toBeUndefined()
    expect(find({ pm2: 'running' }, 'pm2')).toMatchObject({ level: 'ok', detail: 'Fotobogen is running under it' })
    expect(find({ pm2: 'installed' }, 'pm2')).toMatchObject({ level: 'ok' })
    expect(find({ pm2: 'installed' }, 'pm2').detail).toContain('pm2 start ecosystem.config.cjs')
    const missing = find({ pm2: 'missing' }, 'pm2')
    expect(missing).toMatchObject({ level: 'note', detail: 'not installed' })
    expect(missing.fix).toContain('npm install -g pm2')
    expect(missing.fix).toContain('Not needed on your own computer')
    const checks = evaluate({ ...good, pm2: 'missing' })
    expect(passed(checks)).toBe(true)
    // A note is part of the first, full report and is not repeated at later starts.
    expect(formatReport(checks, true)).toContain('  --   pm2: not installed')
    expect(formatReport(checks, false)).toBe('')
  })

  it('finds pm2 on the PATH without running it', () => {
    const bin = mkdtempSync(join(tmpdir(), 'fb-bin-'))
    const empty = mkdtempSync(join(tmpdir(), 'fb-bin-'))
    const separator = process.platform === 'win32' ? ';' : ':'
    expect(pm2State({ PATH: empty }, () => false)).toBe('missing')
    writeFileSync(join(bin, process.platform === 'win32' ? 'pm2.cmd' : 'pm2'), '')
    expect(pm2State({ PATH: `${empty}${separator}${bin}` }, () => false)).toBe('installed')
    expect(pm2State({ PATH: empty, pm_id: '0' }, () => false)).toBe('running')
    expect(pm2State({ PATH: bin, FOTOBOGEN_IN_DOCKER: '1' }, () => false)).toBeNull()
    expect(pm2State({ PATH: bin }, path => path === '/.dockerenv')).toBeNull()
  })

  it('prints every line the first time, and only problems after that', () => {
    const checks = evaluate({ ...good, memoryMb: 512, linux: { id: 'arch', like: [], name: 'Arch Linux' } })
    const full = formatReport(checks, true)
    expect(full).toContain('  ok   Node.js: version 24.22.3')
    expect(full).toContain(' FAIL  Memory: 0.5 GB available')
    expect(full).toContain(' WARN  Operating system: Arch Linux is not a tested Linux')
    const brief = formatReport(checks, false)
    expect(brief).not.toContain('Node.js')
    expect(brief).toContain('FAIL')
    expect(formatReport(evaluate(good), false)).toBe('')
  })

  it('finds this machine fit to run the tests', async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'fb-preflight-')), 'data')
    const facts = await gatherFacts(dataDir)
    expect(facts).toMatchObject({ imageProblem: null, databaseProblem: null, dataDirProblem: null, dataDir })
    expect(facts.memoryMb).toBeGreaterThan(900)
    expect(facts.freeDiskMb).toBeGreaterThan(0)
    expect(passed(evaluate(facts))).toBe(true)
  })

  it('reports a data directory that cannot be created', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fb-preflight-')), 'a-file')
    writeFileSync(file, 'not a directory')
    const facts = await gatherFacts(join(file, 'data'))
    expect(facts.dataDirProblem).toBeTruthy()
    expect(passed(evaluate(facts))).toBe(false)
  })
})
