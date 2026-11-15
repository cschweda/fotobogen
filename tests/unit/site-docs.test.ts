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
      // Line endings aside: Windows checks the files out with its own.
      expect(readFileSync(onDisk(path), 'utf8').replace(/\r\n/g, '\n') === contents, `${path} is out of date: run "node docs/site/build.mjs"`).toBe(true)
    }
  })

  it('cover installation, usage, skins, modules, and questions', () => {
    expect(PAGES.map((page: { slug: string }) => page.slug)).toEqual(['', 'installation', 'configuration', 'usage', 'customization', 'skins', 'writing-a-skin', 'modules', 'writing-a-module', 'faq', 'changelog'])
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

  it('explain every single setting in fotobogen.config.js, and every name in .env.sample', async () => {
    const config = (await import('../../fotobogen.config.js')).default as Record<string, unknown>
    const page = files.get('docs/configuration/index.html')!
    // Every value in the file, by its full name: server.port, internals.auth.sessionDays, ...
    const names: string[] = []
    const walk = (value: unknown, path: string[]) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [key, inner] of Object.entries(value)) walk(inner, [...path, key])
      }
      else names.push(path.join('.'))
    }
    walk(config, [])
    expect(names.length).toBeGreaterThan(30)
    for (const name of names) {
      // "internals.auth.sessionDays" is written as auth.sessionDays under the internals.auth heading;
      // the keys of a small table of values (webpQuality.thumb, formatMegapixels.avif) are listed with it.
      const parts = name.split('.')
      const written = [name, parts.slice(-2).join('.'), parts.at(-1)!].some(form => page.includes(`<code>${form}</code>`) || page.includes(`<code>${form}:`))
      expect(written, `${name} is not explained on the configuration page`).toBe(true)
    }
    // Every group under internals has its own heading saying it is not to be changed.
    for (const group of Object.keys(config.internals as object)) expect(page, group).toContain(`<code>internals.${group}</code>`)
    // And every setting .env.sample offers is documented by its .env name.
    const env = [...readFileSync('.env.sample', 'utf8').matchAll(/^# ([A-Z_]+)=/gm)].map(match => match[1]!)
    expect(env.length).toBeGreaterThan(6)
    for (const name of env) expect(page.includes(`<code>${name}`), `${name} from .env.sample is not on the configuration page`).toBe(true)
  })

  it('publish the changelog as the Releases page, and agree with package.json about the version', async () => {
    const { releasesPage } = await import('../../docs/site/build.mjs') as { releasesPage: () => { latest: { version: string, date: string } | null, body: string } }
    const releases = releasesPage()
    const changelog = readFileSync('CHANGELOG.md', 'utf8')
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

    // The newest release in the changelog is the version the software says it is.
    expect(releases.latest?.version).toBe(pkg.version)
    expect(changelog).toContain(`## [${pkg.version}] - `)
    // Every release in the changelog is a heading on the page, with its date written out.
    const versions = [...changelog.matchAll(/^## \[(\d[^\]]*)\] - (\d{4})-(\d{2})-(\d{2})/gm)]
    expect(versions.length).toBeGreaterThan(0)
    for (const [, version, year] of versions) {
      expect(releases.body).toMatch(new RegExp(`<h2 id="v${version!.replace(/\./g, '-')}">Version ${version!.replace(/\./g, '\\.')}, \\d+ \\w+ ${year}</h2>`))
    }
    // Every bullet of the changelog is on the page.
    const bullets = changelog.split('\n').filter(line => line.startsWith('- ')).length
    expect((releases.body.match(/<li>/g) ?? []).length).toBe(bullets)
    // Nothing of the Markdown is left showing.
    expect(releases.body).not.toMatch(/\*\*|`|\]\(/)
    // An empty "Unreleased" section is not shown.
    expect(releases.body).not.toContain('Nothing yet.')

    // The front page and the README name the same version.
    expect(readFileSync('site/index.html', 'utf8')).toContain(`Version ${pkg.version}`)
    expect(readFileSync('README.md', 'utf8')).toContain(`**Version ${pkg.version}**`)
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
