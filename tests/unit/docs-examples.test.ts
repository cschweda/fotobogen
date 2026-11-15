// The "Writing a module" guide says its examples work. This runs each one,
// exactly as printed on the page, through the module tester, so the page
// cannot drift from what Fotobogen accepts.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { testModule } from '../../server/modules/devtools.ts'
import { parseSkin, cleanValues, contrastWarnings } from '../../server/skins/registry.ts'

const unescape = (html: string) => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const blocks = (page: string) => [...readFileSync(`docs/site/pages/${page}.html`, 'utf8').matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map(match => unescape(match[1]!))

describe('the examples in "Writing a module"', () => {
  const modules = blocks('writing-a-module').filter(code => code.includes('export default {') && code.includes('transforms:'))

  it('are all complete modules', () => {
    // Sepia, the border, darker corners, specks, and two steps in order.
    expect(modules).toHaveLength(5)
  })

  it.each(modules.map((code, index) => [code.match(/id: '([a-z-]+)'/)![1]!, index, code] as const))('"%s" passes the module tester as printed', async (id, index, code) => {
    const dir = mkdtempSync(join(tmpdir(), 'fb-doc-example-'))
    const name = `example-${index}`
    mkdirSync(join(dir, name))
    writeFileSync(join(dir, name, 'module.json'), JSON.stringify({ name, version: '1.0.0', label: id, entry: 'index.mjs' }))
    writeFileSync(join(dir, name, 'index.mjs'), code)
    const result = await testModule(join(dir, name), { outDir: join(dir, 'out') })
    expect(result.lines.filter(line => !line.ok).map(line => line.text)).toEqual([])
    expect(result.ok).toBe(true)
    // A large and a small picture were written for each.
    expect(result.written).toHaveLength(2)
  })

  it('show a module.json that the loader accepts', () => {
    const manifest = blocks('writing-a-module').find(code => code.trim().startsWith('{') && code.includes('"entry"'))!
    expect(JSON.parse(manifest)).toEqual({ name: 'sepia', version: '1.0.0', label: 'Sepia', description: 'A warm brown tone.', entry: 'index.mjs' })
  })
})

describe('the example in "Writing a skin"', () => {
  const json = blocks('writing-a-skin').find(code => code.trim().startsWith('{') && code.includes('"modes"'))!

  it('is a skin.json that loads, with readable text in both modes', () => {
    const skin = parseSkin({ name: 'harbour', json, css: readFileSync('skins/swiss/skin.css', 'utf8') }, 'installed')
    expect(skin.error).toBeNull()
    expect(skin.mode).toBe('light')
    expect(Object.keys(skin.options)).toEqual(['accent', 'gutter', 'columns'])
    expect(contrastWarnings(skin, cleanValues(skin, {}))).toEqual([])
  })

  it('quotes the warning Fotobogen really gives for a faint colour', () => {
    const faint = parseSkin({ name: 'harbour', json: json.replace('#4a5b66', '#9aa8b0'), css: 'x' }, 'installed')
    const warning = contrastWarnings(faint, cleanValues(faint, {}))[0]!
    expect(readFileSync('docs/site/pages/writing-a-skin.html', 'utf8')).toContain(unescape(warning).replace(/"/g, '"'))
  })

  it('lists every message a skin can fail with, word for word', () => {
    const page = unescape(readFileSync('docs/site/pages/writing-a-skin.html', 'utf8'))
    const failing: [Record<string, unknown>, string][] = [
      [{ name: 'other' }, 'They must match.'],
      [{ version: '' }, 'skin.json needs a "version".'],
      [{ modes: undefined }, 'skin.json needs "modes" with a "light" and a "dark" set of colours. Every skin can be viewed in both.'],
      [{ modes: { light: { a: '#000000' }, dark: {} } }, 'The light and dark modes must name the same colours.'],
      [{ options: { x: { type: 'slider' } } }, 'has an unknown type. Use "color", "select", or "range".'],
      [{ look: 'bw' }, '"look" must be a list of up to four steps, each with a "module", a "transform", and "params".'],
    ]
    for (const [change, message] of failing) {
      const skin = parseSkin({ name: 'harbour', json: JSON.stringify({ ...JSON.parse(json), ...change }), css: 'x' }, 'installed')
      expect(skin.error, JSON.stringify(change)).toContain(message)
      expect(page.includes(message), `the page does not quote: ${message}`).toBe(true)
    }
  })
})
