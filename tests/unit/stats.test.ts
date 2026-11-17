import { describe, expect, it } from 'vitest'
import { cleanStats, STATS_OFF, statsHtml, statsTags } from '../../shared/stats.ts'

describe('visitor statistics settings', () => {
  it('are off unless a service is chosen, and off for anything unrecognised', () => {
    expect(cleanStats(null)).toEqual({ settings: STATS_OFF, errors: {} })
    expect(cleanStats({ provider: 'matomo' }).settings.provider).toBe('off')
    expect(statsTags(STATS_OFF)).toBeNull()
  })

  it('take a Plausible script address, and a domain for the older script', () => {
    const { settings, errors } = cleanStats({ provider: 'plausible', plausibleScript: ' https://plausible.io/js/pa-AbC123.js ', plausibleDomain: 'Photos.Example.com' })
    expect(errors).toEqual({})
    expect(settings).toMatchObject({ provider: 'plausible', plausibleScript: 'https://plausible.io/js/pa-AbC123.js', plausibleDomain: 'photos.example.com' })
    const tags = statsTags(settings)!
    expect(tags.scripts).toEqual([{ src: 'https://plausible.io/js/pa-AbC123.js', attributes: { 'data-domain': 'photos.example.com' } }])
    expect(tags.inline).toContain('plausible.init()')
    expect(tags.allow).toEqual(['https://plausible.io'])
  })

  it('refuse a script address that is not a plain https address', () => {
    for (const address of ['', 'http://plausible.io/js/script.js', 'javascript:alert(1)', 'https://user:pw@plausible.io/x.js', 'https://localhost/x.js', '//plausible.io/x.js', 'https://plausible.io/x.js"><script>']) {
      expect(cleanStats({ provider: 'plausible', plausibleScript: address }).errors.plausibleScript, address).toBeTruthy()
    }
    expect(cleanStats({ provider: 'plausible', plausibleScript: 'https://plausible.io/js/script.js', plausibleDomain: 'not a domain' }).errors.plausibleDomain).toBeTruthy()
  })

  it('take a Google Analytics measurement ID and nothing else', () => {
    const { settings, errors } = cleanStats({ provider: 'google', googleId: ' g-ab12cd34ef ' })
    expect(errors).toEqual({})
    expect(settings.googleId).toBe('G-AB12CD34EF')
    const tags = statsTags(settings)!
    expect(tags.scripts).toEqual([{ src: 'https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF', attributes: {} }])
    expect(tags.inline).toContain(`gtag('config','G-AB12CD34EF')`)
    expect(tags.allow).toContain('https://*.google-analytics.com')
    for (const id of ['', 'UA-1234-5', `G-AB');alert(1);//`, 'G-ab cd']) expect(cleanStats({ provider: 'google', googleId: id }).errors.googleId, id).toBeTruthy()
  })

  it('take another service as a script address, data- attributes, and where it reports to', () => {
    const { settings, errors } = cleanStats({
      provider: 'other', otherScript: 'https://gc.zgo.at/count.js', otherReportsTo: 'https://me.goatcounter.com/count',
      otherAttributes: [{ name: 'data-goatcounter', value: 'https://me.goatcounter.com/count' }, { name: '', value: '' }],
    })
    expect(errors).toEqual({})
    const tags = statsTags(settings)!
    expect(tags.scripts).toEqual([{ src: 'https://gc.zgo.at/count.js', attributes: { 'data-goatcounter': 'https://me.goatcounter.com/count' } }])
    expect(tags.inline).toBeNull()
    expect(tags.allow).toEqual(['https://gc.zgo.at', 'https://me.goatcounter.com'])
  })

  it('refuse attributes that are not data- attributes, such as onload or src', () => {
    for (const name of ['onload', 'src', 'data-', 'data-X y', 'nonce', 'data-a"b']) {
      expect(cleanStats({ provider: 'other', otherScript: 'https://a.example/s.js', otherAttributes: [{ name, value: 'x' }] }).errors.otherAttributes, name).toBeTruthy()
    }
    expect(cleanStats({ provider: 'other', otherScript: 'https://a.example/s.js', otherAttributes: [{ name: 'data-a', value: 'line\nbreak' }] }).errors.otherAttributes).toBeTruthy()
  })

  it('write the tags with every value escaped', () => {
    const tags = statsTags(cleanStats({ provider: 'other', otherScript: 'https://a.example/s.js?a=1&b=2', otherAttributes: [{ name: 'data-site', value: 'a"b<c>&d' }] }).settings)!
    const html = statsHtml(tags)
    expect(html).toBe('<script defer src="https://a.example/s.js?a=1&amp;b=2" data-site="a&quot;b&lt;c&gt;&amp;d" data-fb-stats></script>')
    const google = statsHtml(statsTags(cleanStats({ provider: 'google', googleId: 'G-AB12CD34EF' }).settings)!)
    expect(google).toContain('<script>window.dataLayer')
    expect(google.match(/<script/g)).toHaveLength(2)
  })
})
