import { describe, expect, it } from 'vitest'
import { colourWanted, painter } from '../../server/core/colour.ts'
import { evaluate, formatReport, type Facts } from '../../server/core/preflight.ts'

const good: Facts = {
  nodeVersion: '24.22.3', platform: 'linux', arch: 'x64',
  linux: { id: 'ubuntu', like: ['debian'], name: 'Ubuntu 26.04 LTS' },
  memoryMb: 2048, swapMb: 2048, dataDir: '/srv/fotobogen/data', freeDiskMb: 20_000,
  dataDirProblem: null, imageProblem: null, databaseProblem: null,
}
const ESC = '\u001B['

describe('colour in the terminal', () => {
  it('is used at a terminal, and not when the output goes to a file, a log, or another program', () => {
    expect(colourWanted({}, true)).toBe(true)
    expect(colourWanted({}, false)).toBe(false)
  })
  it('is switched off by NO_COLOR or a terminal that cannot show it, and on by FORCE_COLOR', () => {
    expect(colourWanted({ NO_COLOR: '1' }, true)).toBe(false)
    expect(colourWanted({ TERM: 'dumb' }, true)).toBe(false)
    expect(colourWanted({ FORCE_COLOR: '1' }, false)).toBe(true)
    expect(colourWanted({ FORCE_COLOR: '0' }, true)).toBe(false)
    expect(colourWanted({ NO_COLOR: '1', FORCE_COLOR: '1' }, true)).toBe(false)
    expect(colourWanted({ NO_COLOR: '' }, true)).toBe(true) // set but empty does not count
  })
  it('wraps text in a colour and always puts the terminal back, or leaves the text alone', () => {
    const on = painter(true)
    expect(on.green('ok')).toBe(`${ESC}32mok${ESC}39m`)
    expect(on.red('FAIL')).toBe(`${ESC}31mFAIL${ESC}39m`)
    expect(on.yellow('WARN')).toBe(`${ESC}33mWARN${ESC}39m`)
    expect(on.bold('x')).toBe(`${ESC}1mx${ESC}22m`)
    const off = painter(false)
    for (const paint of [off.green, off.red, off.yellow, off.dim, off.bold]) expect(paint('same')).toBe('same')
  })
})

describe('the preflight report in colour', () => {
  const checks = evaluate({ ...good, memoryMb: 512, linux: { id: 'arch', like: [], name: 'Arch Linux' }, pm2: 'missing' })
  it('marks ok green, a warning yellow, a failure red, and a note dim', () => {
    const report = formatReport(checks, true, painter(true))
    expect(report).toContain(`${ESC}32m  ok  ${ESC}39m Node.js: version 24.22.3`)
    expect(report).toContain(`${ESC}33m WARN ${ESC}39m Operating system:`)
    expect(report).toContain(`${ESC}31m FAIL ${ESC}39m Memory:`)
    expect(report).toContain(`${ESC}2m  --  ${ESC}22m pm2: not installed`)
  })
  it('keeps the words, so the report reads the same without colour', () => {
    const plain = formatReport(checks, true)
    expect(plain).not.toContain(ESC)
    // eslint-disable-next-line no-control-regex
    expect(formatReport(checks, true, painter(true)).replace(/\u001B\[\d+m/g, '')).toBe(plain)
  })
})
