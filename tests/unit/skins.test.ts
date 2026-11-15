import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanValues, contrastRatio, contrastWarnings, createSkinRegistry, cssVersion, parseSkin, readSkinFolders, renderCss, type SkinFiles } from '../../server/skins/registry.ts'

const swissFiles: SkinFiles = { name: 'swiss', json: readFileSync('skins/swiss/skin.json', 'utf8'), css: readFileSync('skins/swiss/skin.css', 'utf8') }
const swiss = parseSkin(swissFiles, 'bundled')
const files = (name: string, json: Record<string, unknown>, css = 'body { color: red }'): SkinFiles => ({ name, json: JSON.stringify({ name, version: '1.0.0', label: name, ...json }), css })

describe('the Swiss skin', () => {
  it('loads, with three options and readable text', () => {
    expect(swiss.error).toBeNull()
    expect(Object.entries(swiss.options).map(([key, option]) => [key, option.type])).toEqual([['accent', 'color'], ['gutter', 'select'], ['columns', 'range']])
    expect(contrastWarnings(swiss, cleanValues(swiss, {}))).toEqual([])
  })
  it('is dark, with off-white text and one red accent', () => {
    expect(swiss.tokens).toMatchObject({ ground: '#0a0a0b', text: '#f5f5f2', accent: '#e30613' })
    expect(swiss.css).not.toMatch(/border-radius|box-shadow|gradient/)
  })
})

describe('skin options', () => {
  it('fall back to the default for anything missing or invalid', () => {
    expect(cleanValues(swiss, { accent: 'red', gutter: 'enormous', columns: 99, extra: 1 })).toEqual({ accent: '#e30613', gutter: 'hairline', columns: 6 })
    expect(cleanValues(swiss, { accent: '#00AAFF', gutter: 'wide', columns: 3 })).toEqual({ accent: '#00aaff', gutter: 'wide', columns: 3 })
    expect(cleanValues(swiss, 'nonsense')).toEqual({ accent: '#e30613', gutter: 'hairline', columns: 4 })
  })
  it('are appended to the stylesheet as custom-property overrides', () => {
    const css = renderCss(swiss, { accent: '#00aaff', gutter: 'wide', columns: 3 })
    expect(css.startsWith(swiss.css)).toBe(true)
    expect(css).toContain('--fb-accent: #00aaff;')
    expect(css).toContain('--fb-gutter: 1.25rem;') // the select's value, not its name
    expect(css).toContain('--fb-columns: 3;')
  })
  it('change the version of the stylesheet, so browsers fetch it again', () => {
    expect(cssVersion(renderCss(swiss, { accent: '#00aaff' }))).not.toBe(cssVersion(renderCss(swiss, {})))
    expect(cssVersion(renderCss(swiss, {}))).toMatch(/^[0-9a-f]{10}$/)
  })
  it('cannot smuggle CSS into the stylesheet', () => {
    const bad = parseSkin(files('evil', { options: { gap: { type: 'select', options: ['a'], default: 'a', values: { a: '0; } body { display: none' } } } }), 'installed')
    expect(bad.error).toMatch(/cannot be used as a CSS value/)
    const css = renderCss(swiss, cleanValues(swiss, { accent: '#fff; } * { display:none', gutter: 'wide; x' }))
    expect(css).not.toContain('display:none')
    expect(css).toContain('--fb-accent: #e30613;')
  })
})

describe('contrast', () => {
  it('is measured the WCAG way', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })
  it('warns when a skin puts text on a background it cannot be read against', () => {
    const faint = parseSkin(files('faint', { tokens: { ground: '#101010', text: '#3a3a3a' }, contrast: [['text', 'ground']] }), 'installed')
    expect(contrastWarnings(faint, {})).toEqual(['"text" on "ground" has a contrast of 1.7:1. Text needs at least 4.5:1 to be readable.'])
  })
  it('uses the colours chosen in the admin', () => {
    const skin = parseSkin(files('pick', { tokens: { ground: '#000000' }, contrast: [['ink', 'ground']], options: { ink: { type: 'color', default: '#ffffff' } } }), 'installed')
    expect(contrastWarnings(skin, { ink: '#ffffff' })).toEqual([])
    expect(contrastWarnings(skin, { ink: '#222222' })).toHaveLength(1)
  })
})

describe('reading skins', () => {
  it('reports what is wrong with a skin instead of failing', () => {
    expect(parseSkin({ name: 'x', json: '{ nope', css: 'a{}' }, 'installed').error).toBeTruthy()
    expect(parseSkin(files('nocss', {}, '  '), 'installed').error).toBe('skin.css is missing or empty.')
    expect(parseSkin({ ...files('one', {}), name: 'two' }, 'installed').error).toMatch(/must match/)
    expect(parseSkin(files('opt', { options: { size: { type: 'slider' } } }), 'installed').error).toMatch(/unknown type/)
    expect(parseSkin(files('tok', { tokens: { ground: 'black' } }), 'installed').error).toMatch(/must be a colour/)
  })
  it('finds skins in a folder such as data/skins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-skins-'))
    mkdirSync(join(dir, 'paper'))
    writeFileSync(join(dir, 'paper', 'skin.json'), JSON.stringify({ name: 'paper', version: '0.1.0', label: 'Paper' }))
    writeFileSync(join(dir, 'paper', 'skin.css'), 'body { background: white }')
    mkdirSync(join(dir, 'empty'))
    const registry = createSkinRegistry([swissFiles], readSkinFolders(dir))
    expect(registry.list().map(skin => [skin.name, skin.source, skin.error === null])).toEqual([['swiss', 'bundled', true], ['empty', 'installed', false], ['paper', 'installed', true]])
    expect(readSkinFolders(join(dir, 'missing'))).toEqual([])
  })
  it('does not let an installed folder replace a bundled skin', () => {
    const registry = createSkinRegistry([swissFiles], [files('swiss', {}, 'body { display: none }')])
    expect(registry.get('swiss')!.source).toBe('bundled')
    expect(registry.get('swiss')!.css).toBe(swissFiles.css)
  })

describe('the skins that come with Fotobogen', () => {
  const bundled = ['swiss', 'papier', 'plakat'].map(name => parseSkin({ name, json: readFileSync(`skins/${name}/skin.json`, 'utf8'), css: readFileSync(`skins/${name}/skin.css`, 'utf8') }, 'bundled'))

  it('all load, with readable text and the same three options', () => {
    for (const skin of bundled) {
      expect(skin.error, skin.name).toBeNull()
      expect(contrastWarnings(skin, cleanValues(skin, {})), skin.name).toEqual([])
      expect(Object.keys(skin.options), skin.name).toEqual(['accent', 'gutter', 'columns'])
    }
  })
  it('offer a light one and two dark ones', () => {
    const light = (skin: (typeof bundled)[number]) => contrastRatio(skin.tokens.ground!, '#000000') > 10
    expect(bundled.map(skin => [skin.label, light(skin) ? 'light' : 'dark'])).toEqual([['Swiss', 'dark'], ['Papier', 'light'], ['Plakat', 'dark']])
  })
  it('each start every rule from the public pages, and style every part of them', () => {
    const parts = ['.fb-site-header', '.fb-grid--masonry', '.fb-grid--square', '.fb-tile', '.fb-photo__title', '.fb-modal', '.fb-albums', '.fb-tag', '.fb-pager__more', '.fb-slideshow__controls', '.fb-photo__licence']
    for (const skin of bundled) {
      expect(skin.css, skin.name).toContain(':root.fb-public {')
      for (const part of parts) expect(skin.css.includes(part), `${skin.name} styles ${part}`).toBe(true)
      // Nothing may escape to the admin: no bare element rules.
      expect(skin.css.match(/^(html|body|a|h1|h2|p|img)\b[^{]*\{/m), skin.name).toBeNull()
    }
  })
})
