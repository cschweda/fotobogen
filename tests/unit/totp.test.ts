import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, checkTotp, cleanBackupCode, newBackupCodes, newTotpKey, otpauthUri, totpAt } from '../../server/core/totp.ts'
import { keyFileFor, loadServerKey, markServerKeyConfirmed } from '../../server/core/two-step-key.ts'

// The key from RFC 6238's test vectors: the ASCII text "12345678901234567890".
const RFC_KEY = base32Encode(Buffer.from('12345678901234567890'))

describe('codes from an authenticator app', () => {
  it('reads and writes keys the way authenticator apps do', () => {
    expect(RFC_KEY).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(base32Decode(RFC_KEY).toString()).toBe('12345678901234567890')
    expect(base32Decode('gezd gnbv-gy3t qojq').toString()).toBe('1234567890') // as a person might type it
    expect(() => base32Decode('not base 32 !!')).toThrow()
  })

  it('gives the codes the standard gives', () => {
    // RFC 6238, appendix B, SHA-1 rows, cut to six digits.
    expect(totpAt(RFC_KEY, 59_000)).toBe('287082')
    expect(totpAt(RFC_KEY, 1111111109_000)).toBe('081804')
    expect(totpAt(RFC_KEY, 1234567890_000)).toBe('005924')
    expect(totpAt(RFC_KEY, 20000000000_000)).toBe('353130')
  })

  it('accepts the code of this half minute, the one before and the one after, and nothing else', () => {
    const now = 1234567890_000
    for (const offset of [-30_000, 0, 30_000]) expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now + offset), now, null)).toBeTypeOf('number')
    expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now + 60_000), now, null)).toBeNull()
    expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now - 60_000), now, null)).toBeNull()
    for (const wrong of ['', '12345', '1234567', 'abcdef', '00592 4x']) expect(checkTotp(RFC_KEY, wrong, now, null)).toBeNull()
    expect(checkTotp(RFC_KEY, ' 005 924 ', now, null)).toBeTypeOf('number') // spaces as apps show them
  })

  it('accepts each code once: a code seen over a shoulder is no use a moment later', () => {
    const now = 1234567890_000
    const used = checkTotp(RFC_KEY, totpAt(RFC_KEY, now), now, null)!
    expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now), now, used)).toBeNull()
    expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now - 30_000), now, used)).toBeNull() // nor an older one
    expect(checkTotp(RFC_KEY, totpAt(RFC_KEY, now + 30_000), now, used)).toBe(used + 1)
  })

  it('makes keys and backup codes nobody could guess, and an address apps understand', () => {
    const key = newTotpKey()
    expect(key).toMatch(/^[A-Z2-7]{32}$/)
    expect(newTotpKey()).not.toBe(key)
    const codes = newBackupCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
    expect(cleanBackupCode(' ABCDE fghjk ')).toBe('abcde-fghjk')
    expect(cleanBackupCode('abcde-fghjk')).toBe('abcde-fghjk')
    expect(cleanBackupCode('123456')).toBeNull()
    expect(otpauthUri(RFC_KEY, 'my server & co')).toBe(`otpauth://totp/Fotobogen:my%20server%20%26%20co?secret=${RFC_KEY}&issuer=Fotobogen`)
  })
})

describe('the key a server keeps for every Fotobogen on it', () => {
  it('lives in the home folder, or in the data folder inside Docker, or where TWO_STEP_KEY_FILE says', () => {
    expect(keyFileFor({}, '/home/ansel', '/srv/site/data')).toBe(join('/home/ansel', '.fotobogen', 'two-step-key.json'))
    expect(keyFileFor({ FOTOBOGEN_IN_DOCKER: '1' }, '/home/ansel', '/srv/site/data')).toBe(join('/srv/site/data', 'two-step-key.json'))
    expect(keyFileFor({ TWO_STEP_KEY_FILE: '/etc/fb/key.json', FOTOBOGEN_IN_DOCKER: '1' }, '/home/ansel', '/srv/site/data')).toBe('/etc/fb/key.json')
    expect(keyFileFor({}, '', '/srv/site/data')).toBe(join('/srv/site/data', 'two-step-key.json')) // an account with no home
  })

  it('is made once, kept private, and found again by the next site', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fb-key-')), 'deep', 'two-step-key.json')
    const first = loadServerKey(file, {})
    expect(first.key).toMatch(/^[A-Z2-7]{32}$/)
    expect(first.confirmed).toBe(false)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(loadServerKey(file, {})).toEqual(first) // the same key, however often it is asked for
    markServerKeyConfirmed(file)
    expect(loadServerKey(file, {})).toEqual({ ...first, confirmed: true })
    expect(JSON.parse(readFileSync(file, 'utf8')).key).toBe(first.key)
  })

  it('can be given as a setting instead, and refuses a file that is damaged rather than replacing it', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fb-key-')), 'two-step-key.json')
    expect(loadServerKey(file, { TWO_STEP_KEY: 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq' })).toEqual({ key: RFC_KEY, confirmed: true, fromSetting: true })
    expect(() => loadServerKey(file, { TWO_STEP_KEY: 'short' })).toThrow(/TWO_STEP_KEY/)
    writeFileSync(file, 'not json')
    expect(() => loadServerKey(file, {})).toThrow(/damaged/)
  })
})
