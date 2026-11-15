// The documentation pages of fotobogen.com are written by docs/site/build.mjs
// and committed, because Netlify publishes site/ with no build step.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, PAGES } from '../../docs/site/build.mjs'

const files = build() as Map<string, string>
const pages = [...files].filter(([path]) => path.endsWith('index.html'))
const onDisk = (path: string) => join('site', path)
/** The file a site address is served from. */
const fileFor = (address: string) => {
  const path = address.replace(/^\//, '')
  return path === '' || path.endsWith('/') ? `${path}index.html` : path
}

describe('the documentation pages', () => {
  it('are built: what is committed in site/docs is what the sources produce', () => {
    for (const [path, contents] of files) {
      expect(existsSync(onDisk(path)), `${path} is missing: run "node docs/site/build.mjs"`).toBe(true)
      expect(readFileSync(onDisk(path), 'utf8') === contents, `${path} is out of date: run "node docs/site/build.mjs"`).toBe(true)
    }
  })

  it('cover installation, usage, skins, modules, and questions', () => {
    expect(PAGES.map((page: { slug: string }) => page.slug)).toEqual(['', 'installation', 'usage', 'skins', 'modules', 'faq'])
    const text = (slug: string) => files.get(`docs/${slug}/index.html`)!
    // Installation: each system, both Docker routes, and server sizes.
    for (const id of ['requirements', 'macos', 'windows', 'linux', 'docker-vps', 'docker-forge', 'docker-local', 'first-run']) {
      expect(text('installation'), id).toContain(`<h2 id="${id}">`)
    }
    expect(text('installation')).toMatch(/Minimum<\/th><th>Recommended/)
    // Questions: backups, and ways to start over.
    expect(text('faq')).toContain('<h2 id="backups">')
    expect(text('faq')).toContain('<h2 id="starting-over">')
    expect(text('faq')).toContain('Start again from nothing')
  })

  it('link only to pages, sections, and images that exist', () => {
    for (const [path, html] of pages) {
      for (const [, address] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
        const [target, anchor] = address!.split('#') as [string, string | undefined]
        const file = fileFor(target)
        const contents = files.get(file) ?? (existsSync(onDisk(file)) ? readFileSync(onDisk(file), 'utf8') : undefined)
        expect(contents !== undefined, `${path} links to ${address}, which does not exist`).toBe(true)
        if (anchor) expect(contents!.includes(`id="${anchor}"`), `${path} links to ${address}, but there is no such section`).toBe(true)
      }
      for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
        expect(html.includes(`id="${anchor}"`), `${path} links to #${anchor}, which is not on the page`).toBe(true)
      }
    }
  })

  it('are structured for people who cannot see them: one title, headings in order, described images', () => {
    for (const [path, html] of pages) {
      expect(html.match(/<h1[ >]/g), path).toHaveLength(1)
      expect(html).toContain('<html lang="en">')
      expect(html).toContain('<a class="skip" href="#main">')
      // No heading level is skipped inside the page's content.
      const main = html.slice(html.indexOf('<main'))
      let last = 1
      for (const [, level] of main.matchAll(/<h([1-6])[ >]/g)) {
        expect(Number(level) - last, `${path}: an h${level} follows an h${last}`).toBeLessThanOrEqual(1)
        last = Number(level)
      }
      for (const [image] of html.matchAll(/<img [^>]*>/g)) {
        expect(image, path).toMatch(/alt="[^"]{10,}"/)
        expect(image, path).toMatch(/width="\d+" height="\d+"/)
      }
      // Every wide table can scroll inside itself, so the page never scrolls sideways.
      expect((html.match(/<table/g) ?? []).length, path).toBe((html.match(/<div class="table" tabindex="0"/g) ?? []).length)
      // Code that scrolls can be reached from the keyboard.
      expect(html, path).not.toContain('<pre>')
    }
  })

  it('are reachable from the front page', () => {
    const front = readFileSync('site/index.html', 'utf8')
    expect(front).toContain('href="/docs/"')
    expect(front).toContain('href="/docs/installation/"')
  })
})
