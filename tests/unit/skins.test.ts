import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanValues, contrastRatio, contrastWarnings, createSkinRegistry, cssVersion, parseSkin, readSkinFolders, renderCss, type SkinFiles } from '../../server/skins/registry.ts'

const swissFiles: SkinFiles = { name: 'swiss', json: readFileSync('skins/swiss/skin.json', 'utf8'), css: readFileSync('skins/swiss/skin.css', 'utf8') }
const swiss = parseSkin(swissFiles, 'bundled')
const files = (name: string, json: Record<string, unknown>, css = 'body { color: red }'): SkinFiles => ({ name, json: JSON.stringify({ name, version: '1.0.0', label: name, modes: { light: {}, dark: {} }, ...json }), css })
const both = (colour: string) => ({ light: colour, dark: colour })

describe('the Swiss skin', () => {
  it('loads, with three options and readable text', () => {
    expect(swiss.error).toBeNull()
    expect(Object.entries(swiss.options).map(([key, option]) => [key, option.type])).toEqual([['accent', 'color'], ['gutter', 'select'], ['columns', 'range']])
    expect(contrastWarnings(swiss, cleanValues(swiss, {}))).toEqual([])
  })
  it('is dark first, with off-white text and one red accent, and has a light mode of black on white', () => {
    expect(swiss.mode).toBe('dark')
    expect(swiss.modes.dark).toMatchObject({ ground: '#0a0a0b', text: '#f5f5f2', accent: '#e30613' })
    expect(swiss.modes.light).toMatchObject({ ground: '#ffffff', text: '#0a0a0b', accent: '#e30613' })
    expect(swiss.css).not.toMatch(/border-radius|box-shadow|gradient/)
  })
})

describe('skin options', () => {
  it('fall back to the default for anything missing or invalid', () => {
    expect(cleanValues(swiss, { accent: 'red', gutter: 'enormous', columns: 99, extra: 1 })).toEqual({ accent: both('#e30613'), gutter: 'hairline', columns: 6 })
    expect(cleanValues(swiss, { accent: '#00AAFF', gutter: 'wide', columns: 3 })).toEqual({ accent: both('#00aaff'), gutter: 'wide', columns: 3 })
    // A colour can differ between the modes; a bad half falls back by itself.
    expect(cleanValues(swiss, { accent: { light: '#112233', dark: 'nope' } }).accent).toEqual({ light: '#112233', dark: '#e30613' })
    expect(cleanValues(swiss, 'nonsense')).toEqual({ accent: both('#e30613'), gutter: 'hairline', columns: 4 })
  })
  it('are appended to the stylesheet as custom-property overrides', () => {
    const css = renderCss(swiss, { accent: '#00aaff', gutter: 'wide', columns: 3 })
    expect(css.startsWith(swiss.css)).toBe(true)
    expect(css).toContain('--fb-accent: #00aaff;')
    expect(css).toContain('--fb-gutter: 1.25rem;') // the select's value, not its name
    expect(css).toContain('--fb-columns: 3;')
  })
  it('give each mode its own colours, chosen by data-fb-mode on the page', () => {
    const css = renderCss(swiss, cleanValues(swiss, { accent: { light: '#aa0000', dark: '#ff8800' } }))
    // Light is the plain rule; dark applies when asked for, or when the page follows a dark device.
    expect(css).toMatch(/:root\.fb-public \{ --fb-ground: #ffffff;[^}]*--fb-accent: #aa0000; color-scheme: light; \}/)
    expect(css).toMatch(/:root\.fb-public\[data-fb-mode="dark"\] \{ --fb-ground: #0a0a0b;[^}]*--fb-accent: #ff8800; color-scheme: dark; \}/)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ :root\.fb-public\[data-fb-mode="auto"\] \{ --fb-ground: #0a0a0b;/)
    // The skin's own stylesheet names no colours for the page; they all come from skin.json.
    expect(swiss.css).not.toMatch(/--fb-(ground|text|muted|line|accent):/)
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
    const faint = parseSkin(files('faint', { modes: { light: { ground: '#ffffff', text: '#111111' }, dark: { ground: '#101010', text: '#3a3a3a' } }, contrast: [['text', 'ground']] }), 'installed')
    expect(contrastWarnings(faint, {})).toEqual(['In dark mode, "text" on "ground" has a contrast of 1.7:1. Text needs at least 4.5:1 to be readable.'])
  })
  it('uses the colours chosen in the admin', () => {
    const skin = parseSkin(files('pick', { modes: { light: { ground: '#000000' }, dark: { ground: '#000000' } }, contrast: [['ink', 'ground']], options: { ink: { type: 'color', default: '#ffffff' } } }), 'installed')
    expect(contrastWarnings(skin, { ink: '#ffffff' })).toEqual([])
    expect(contrastWarnings(skin, { ink: '#222222' })).toHaveLength(2)
    expect(contrastWarnings(skin, { ink: { light: '#ffffff', dark: '#222222' } })).toEqual([expect.stringMatching(/^In dark mode/)])
  })
})

describe('reading skins', () => {
  it('reports what is wrong with a skin instead of failing', () => {
    expect(parseSkin({ name: 'x', json: '{ nope', css: 'a{}' }, 'installed').error).toBeTruthy()
    expect(parseSkin(files('nocss', {}, '  '), 'installed').error).toBe('skin.css is missing or empty.')
    expect(parseSkin({ ...files('one', {}), name: 'two' }, 'installed').error).toMatch(/must match/)
    expect(parseSkin(files('opt', { options: { size: { type: 'slider' } } }), 'installed').error).toMatch(/unknown type/)
    expect(parseSkin(files('tok', { modes: { light: { ground: 'black' }, dark: { ground: 'black' } } }), 'installed').error).toMatch(/must be written like/)
    // Every skin has both modes, with the same colours named in each.
    expect(parseSkin(files('one-mode', { modes: { dark: { ground: '#000000' } } }), 'installed').error).toMatch(/needs "modes" with a "light" and a "dark"/)
    expect(parseSkin(files('old', { modes: undefined, tokens: { ground: '#000000' } }), 'installed').error).toMatch(/needs "modes"/)
    expect(parseSkin(files('uneven', { modes: { light: { ground: '#ffffff', text: '#000000' }, dark: { ground: '#000000' } } }), 'installed').error).toBe('The light and dark modes must name the same colours.')
  })
  it('finds skins in a folder such as data/skins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-skins-'))
    mkdirSync(join(dir, 'paper'))
    writeFileSync(join(dir, 'paper', 'skin.json'), JSON.stringify({ name: 'paper', version: '0.1.0', label: 'Paper', modes: { light: {}, dark: {} } }))
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
  it('each have a light and a dark mode, and say which they show first', () => {
    expect(bundled.map(skin => [skin.label, skin.mode])).toEqual([['Swiss', 'dark'], ['Papier', 'light'], ['Plakat', 'dark']])
    for (const skin of bundled) {
      // Light really is light and dark really is dark: black text reads on one, white on the other.
      expect(contrastRatio(skin.modes.light.ground!, '#000000'), `${skin.name} light`).toBeGreaterThan(10)
      expect(contrastRatio(skin.modes.dark.ground!, '#ffffff'), `${skin.name} dark`).toBeGreaterThan(10)
      for (const mode of ['light', 'dark'] as const) {
        expect(Object.keys(skin.modes[mode]), `${skin.name} ${mode}`).toEqual(['ground', 'text', 'muted', 'line', 'accent'])
        expect(contrastRatio(skin.modes[mode].text!, skin.modes[mode].ground!), `${skin.name} ${mode} text`).toBeGreaterThanOrEqual(7)
        expect(contrastRatio(skin.modes[mode].muted!, skin.modes[mode].ground!), `${skin.name} ${mode} quiet text`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('each start every rule from the public pages, and style every part of them', () => {
    const parts = ['.fb-site-header', '.fb-grid--masonry', '.fb-grid--square', '.fb-tile', '.fb-photo__title', '.fb-modal', '.fb-albums', '.fb-tag', '.fb-pager__more', '.fb-slideshow__controls', '.fb-photo__licence']
    for (const skin of bundled) {
      expect(skin.css, skin.name).toContain(':root.fb-public {')
      expect(skin.css, skin.name).toContain('.fb-mode')
      for (const part of parts) expect(skin.css.includes(part), `${skin.name} styles ${part}`).toBe(true)
      // Nothing may escape to the admin: no bare element rules.
      expect(skin.css.match(/^(html|body|a|h1|h2|p|img)\b[^{]*\{/m), skin.name).toBeNull()
    }
  })
})
