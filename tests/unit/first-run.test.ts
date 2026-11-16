import { describe, expect, it } from 'vitest'
import { askFirstRun, envWith, readPort, readSiteUrl, readYesNo, shouldAsk } from '../../server/core/first-run.ts'

const fresh = { interactive: true, envFileExists: false, databaseExists: false, env: {} }

describe('whether to ask the first-run questions', () => {
  it('asks on a first start at a terminal with nothing decided yet', () => {
    expect(shouldAsk(fresh)).toBe(true)
  })
  it('never asks when nobody is at the keyboard: pm2, Docker, a script', () => {
    expect(shouldAsk({ ...fresh, interactive: false })).toBe(false)
    expect(shouldAsk({ ...fresh, env: { FOTOBOGEN_IN_DOCKER: '1' } })).toBe(false)
    expect(shouldAsk({ ...fresh, env: { pm_id: '0' } })).toBe(false)
    expect(shouldAsk({ ...fresh, env: { CI: 'true' } })).toBe(false)
  })
  it('asks once: not when there is a .env, nor when the site already has its database', () => {
    expect(shouldAsk({ ...fresh, envFileExists: true })).toBe(false)
    expect(shouldAsk({ ...fresh, databaseExists: true })).toBe(false)
  })
  it('does not ask when the answers were already given in the environment, or when told not to', () => {
    for (const name of ['PORT', 'SITE_URL', 'DEMO_MODE']) expect(shouldAsk({ ...fresh, env: { [name]: '1' } })).toBe(false)
    expect(shouldAsk({ ...fresh, env: { FOTOBOGEN_NO_QUESTIONS: '1' } })).toBe(false)
  })
})

describe('reading an answer', () => {
  it('takes Enter as the default', () => {
    expect(readPort('')).toEqual({ value: null })
    expect(readSiteUrl('  ')).toEqual({ value: null })
    expect(readYesNo('')).toEqual({ value: false })
  })
  it('accepts a port a program may use, and explains one it may not', () => {
    expect(readPort(' 8080 ')).toEqual({ value: 8080 })
    for (const bad of ['80', '0', '70000', 'abc', '51.5', '-1', '5150; rm -rf ~']) expect(readPort(bad)).toHaveProperty('problem')
    expect(readPort('80').problem).toContain('1024')
  })
  it('accepts a web address, tidies it, and refuses anything else', () => {
    expect(readSiteUrl('https://photos.example.com/')).toEqual({ value: 'https://photos.example.com' })
    expect(readSiteUrl('photos.example.com')).toEqual({ value: 'https://photos.example.com' })
    expect(readSiteUrl('http://localhost:5150')).toEqual({ value: 'http://localhost:5150' })
    for (const bad of ['ftp://example.com', 'https://', 'not a site', 'https://a.example\nDEMO_MODE=1', 'javascript:alert(1)']) expect(readSiteUrl(bad)).toHaveProperty('problem')
  })
  it('accepts yes and no in the usual ways', () => {
    for (const yes of ['y', 'Y', 'yes', ' YES ']) expect(readYesNo(yes)).toEqual({ value: true })
    for (const no of ['n', 'N', 'no']) expect(readYesNo(no)).toEqual({ value: false })
    expect(readYesNo('maybe')).toHaveProperty('problem')
  })
})

describe('asking', () => {
  const scripted = (answers: string[]) => {
    const asked: string[] = []
    const said: string[] = []
    return { asked, said, question: async (text: string) => { asked.push(text); return answers.shift() ?? '' }, say: (text: string) => { said.push(text) } }
  }

  it('asks three questions, and Enter three times changes nothing', async () => {
    const io = scripted(['', '', ''])
    expect(await askFirstRun(io)).toEqual({ port: null, siteUrl: null, demoMode: false })
    expect(io.asked).toHaveLength(3)
    expect(io.asked[0]).toContain('5150')
    expect(io.asked[2]).toContain('[y/N]')
  })
  it('asks again, saying why, when an answer cannot be used', async () => {
    const io = scripted(['80', '8080', 'nope', 'photos.example.com', 'perhaps', 'y'])
    expect(await askFirstRun(io)).toEqual({ port: 8080, siteUrl: 'https://photos.example.com', demoMode: true })
    expect(io.asked).toHaveLength(6)
    expect(io.said.join('\n')).toContain('1024')
  })
  it('asks for another port when the one given is in use', async () => {
    const io = scripted(['8080', '8081', '', ''])
    const answers = await askFirstRun({ ...io, portIsFree: async port => port !== 8080 })
    expect(answers.port).toBe(8081)
    expect(io.said.join('\n')).toContain('Port 8080 is in use')
  })
})

describe('writing the answers to .env', () => {
  it('writes a new file that says what each line is, with defaults left commented out', () => {
    const text = envWith(null, { port: null, siteUrl: null, demoMode: false })
    expect(text).toMatch(/^# PORT=5150$/m)
    expect(text).toMatch(/^# SITE_URL=/m)
    expect(text).toMatch(/^# DEMO_MODE=1$/m)
    expect(text).not.toMatch(/^[A-Z_]+=/m)
    expect(text).toContain('.env.sample')
  })
  it('writes the answers given', () => {
    const text = envWith(null, { port: 8080, siteUrl: 'https://photos.example.com', demoMode: true })
    expect(text).toMatch(/^PORT=8080$/m)
    expect(text).toMatch(/^SITE_URL=https:\/\/photos\.example\.com$/m)
    expect(text).toMatch(/^DEMO_MODE=1$/m)
  })
  it('changes only its own three lines in a file that already exists', () => {
    const existing = '# mine\nMAX_UPLOAD_MB=80\nPORT=5150\n# DEMO_MODE=1\nDOMAIN=photos.example.com\n'
    const text = envWith(existing, { port: 9000, siteUrl: null, demoMode: true })
    expect(text).toContain('# mine\nMAX_UPLOAD_MB=80\nPORT=9000\nDEMO_MODE=1\nDOMAIN=photos.example.com\n')
    expect(text.match(/^#? ?PORT=/gm)).toHaveLength(1)
    // Going back to the default comments the line out instead of leaving the old value.
    expect(envWith(text, { port: null, siteUrl: null, demoMode: false })).toMatch(/^# PORT=9000$/m)
    expect(envWith(text, { port: null, siteUrl: null, demoMode: false })).toMatch(/^# DEMO_MODE=1$/m)
  })
  it('keeps Windows line endings as they were', () => {
    expect(envWith('PORT=5150\r\nDOMAIN=a.example\r\n', { port: 9000, siteUrl: null, demoMode: false })).toContain('PORT=9000\r\nDOMAIN=a.example\r\n')
  })
})
