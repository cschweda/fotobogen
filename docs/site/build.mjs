// Builds the documentation pages of fotobogen.com.
//
//   node docs/site/build.mjs
//
// Reads docs/site/pages/*.html (the body of each page, with its title and
// summary in a comment on the first line) and writes complete pages to
// site/docs/. Netlify publishes site/ as it is, with no build step, so the
// pages it writes are committed. Run this after changing a page, the
// stylesheet, or this file. tests/unit/site-docs.test.ts fails if you forget.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

/** The pages, in the order they are listed and read. `slug` '' is /docs/. */
export const PAGES = [
  { slug: '', file: 'index', nav: 'Overview' },
  { slug: 'installation', file: 'installation', nav: 'Installation' },
  { slug: 'your-own-domain', file: 'your-own-domain', nav: 'Your own domain' },
  { slug: 'configuration', file: 'configuration', nav: 'Configuration' },
  { slug: 'usage', file: 'usage', nav: 'Using Fotobogen' },
  { slug: 'updating', file: 'updating', nav: 'Updating' },
  { slug: 'customization', file: 'customization', nav: 'Customization' },
  { slug: 'skins', file: 'skins', nav: 'Skins' },
  { slug: 'writing-a-skin', file: 'writing-a-skin', nav: 'Writing a skin' },
  { slug: 'modules', file: 'modules', nav: 'Modules' },
  { slug: 'writing-a-module', file: 'writing-a-module', nav: 'Writing a module' },
  { slug: 'faq', file: 'faq', nav: 'Questions' },
  { slug: 'security-audits', file: 'security-audits', nav: 'Security audits' },
  // Not written by hand: built from CHANGELOG.md, so the site and the repository always say the same.
  { slug: 'changelog', file: null, nav: 'Releases' },
]
const address = page => page.slug ? `/docs/${page.slug}/` : '/docs/'
// Windows checks text out with its own line endings; what is built is the same everywhere.
const text = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** One line of the changelog's Markdown as HTML: `code`, **bold**, and [links](address). */
function inline(markdown) {
  return escape(markdown)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // An address inside the repository becomes its page on GitHub.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, words, address) => `<a href="${/^https?:/.test(address) ? address : `https://github.com/cschweda/fotobogen/blob/main/${address}`}">${words}</a>`)
}

/**
 * The Releases page, from CHANGELOG.md. It understands what that file uses:
 * "## [1.2.3] - 2026-11-15" for a release, "###" for a part of one,
 * paragraphs, and one level of "- " lists.
 */
export function releasesPage() {
  const lines = text(join(root, 'CHANGELOG.md')).split('\n')
  const out = []
  let paragraph = []
  let list = []
  let section = null
  const sections = []
  const flush = () => {
    if (paragraph.length) (section ?? out).push(`<p${section ? '' : ' class="lead"'}>${inline(paragraph.join(' '))}</p>`)
    if (list.length) (section ?? out).push(`<ul>\n${list.map(item => `  <li>${inline(item)}</li>`).join('\n')}\n</ul>`)
    paragraph = []
    list = []
  }
  let leadDone = false
  for (const line of lines) {
    const release = line.match(/^## \[([^\]]+)\](?: - (\d{4})-(\d{2})-(\d{2}))?/)
    if (release) {
      flush()
      const [, version, year, month, day] = release
      section = []
      sections.push({ version, body: section, date: year ? `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}` : null })
    }
    else if (line.startsWith('# ') || /^\[[^\]]+\]: /.test(line)) continue // the file's own title, and its link definitions
    else if (line.startsWith('### ')) { flush(); section?.push(`<h3>${inline(line.slice(4))}</h3>`) }
    else if (line.startsWith('- ')) { if (paragraph.length) flush(); list.push(line.slice(2)) }
    else if (line.trim() === '') flush()
    else if (list.length) list[list.length - 1] += ` ${line.trim()}`
    // Only the first paragraph before the first release is used as the page's opening.
    else if (section || !leadDone) paragraph.push(line.trim())
    if (!section && paragraph.length === 0 && out.length > 0) leadDone = true
  }
  flush()
  const releases = sections.filter(({ version, body }) => !(version === 'Unreleased' && body.join('').replace(/<[^>]+>/g, '').trim() === 'Nothing yet.'))
  const body = [
    '<h1>Releases</h1>',
    '<p class="lead">What is in each version of Fotobogen, newest first. This page is made from <a href="https://github.com/cschweda/fotobogen/blob/main/CHANGELOG.md">CHANGELOG.md</a> in the source, so the two always agree.</p>',
    '<p>Version numbers follow <a href="https://semver.org">semantic versioning</a>: a change in the first number means something you rely on changed, the second adds features, and the third only fixes. <a href="https://github.com/cschweda/fotobogen/blob/main/docs/UPGRADING.md">What a version number promises, and how to upgrade.</a></p>',
    ...releases.flatMap(({ version, date, body }) => [
      version === 'Unreleased'
        ? '<h2 id="unreleased">Not yet released</h2>'
        : `<h2 id="v${version.replace(/[^0-9a-z]+/gi, '-')}">Version ${escape(version)}${date ? `, ${date}` : ''}</h2>`,
      ...body,
    ]),
  ].join('\n')
  const latest = releases.find(({ version }) => version !== 'Unreleased')
  return { title: 'Releases', description: `What is in each version of Fotobogen. The current version is ${latest?.version ?? 'not yet released'}.`, body, latest: latest ? { version: latest.version, date: latest.date } : null }
}

/** A page's source: a first-line comment holding { title, description }, then its HTML. */
function read(page) {
  if (page.slug === 'changelog') return releasesPage()
  const source = text(join(here, 'pages', `${page.file}.html`))
  const meta = source.match(/^<!--\s*(\{.*?\})\s*-->\n/s)
  if (!meta) throw new Error(`${page.file}.html must begin with <!-- {"title": "...", "description": "..."} -->`)
  // Code and tables scroll inside themselves when they are too wide. A keyboard
  // user must be able to reach them to scroll, so each can take focus.
  const body = source.slice(meta[0].length).trim()
    .replace(/<pre>/g, '<pre tabindex="0">')
    .replace(/<div class="table">/g, '<div class="table" tabindex="0" role="group" aria-label="Table; scrolls sideways on a narrow screen">')
  return { ...JSON.parse(meta[1]), body }
}

/** The second-level headings that have an id, for the "On this page" list. */
const sections = body => [...body.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map(([, id, html]) => ({ id, text: html.replace(/<[^>]+>/g, '') }))

function render(page, index) {
  const { title, description, body } = read(page)
  const onThisPage = sections(body)
  const previous = PAGES[index - 1]
  const next = PAGES[index + 1]
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | Fotobogen documentation</title>
<meta name="description" content="${escape(description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0b" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="https://fotobogen.com${address(page)}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://fotobogen.com${address(page)}">
<meta property="og:title" content="${escape(title)} | Fotobogen documentation">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="https://fotobogen.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Fotobogen wordmark beside a contact sheet of sixteen numbered frames, one of them red. Above the wordmark: German for photo sheet, as in a contact sheet.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230a0a0b'/%3E%3Crect x='6' y='9' width='20' height='14' fill='%23e30613'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/docs/docs.css">
<script src="/docs/docs.js" defer></script>
<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://plausible.io/js/pa-UXO2Zaq02zXvfaEecXWvD.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
  <div class="wrap bar">
    <a class="bar__name" href="/">Fotobogen<span>Documentation</span></a>
    <div class="bar__links">
      <a href="https://github.com/cschweda/fotobogen" data-goal="GitHub click" data-where="docs">Source on GitHub</a>
      <button class="toggle" type="button" id="theme">Dark</button>
    </div>
  </div>
</header>
<div class="wrap layout">
  <nav class="pages" aria-label="Documentation">
    <ul class="pages__all">
${PAGES.map(other => `      <li><a href="${address(other)}"${other === page ? ' aria-current="page"' : ''}>${other.nav}</a></li>`).join('\n')}
    </ul>${onThisPage.length > 1 ? `
    <div class="pages__here">
      <h2>On this page</h2>
      <ul>
${onThisPage.map(section => `        <li><a href="#${section.id}">${section.text}</a></li>`).join('\n')}
      </ul>
    </div>` : ''}
  </nav>
  <main id="main" class="doc">
${body}
    <p class="next">
      ${previous ? `<a href="${address(previous)}">Back: ${previous.nav}</a>` : '<span></span>'}
      ${next ? `<a href="${address(next)}">Next: ${next.nav}</a>` : '<a href="/">Fotobogen home</a>'}
    </p>
  </main>
</div>
<footer>
  <div class="wrap">
    <span>Fotobogen is free and open source, under the MIT licence.</span>
    <span>It comes with no warranty. Keep backups of your photographs.</span>
    <span>&copy; 2026 <a href="https://github.com/cschweda" data-goal="Author click">Christopher Schweda</a></span>
  </div>
</footer>
</body>
</html>
`
}

/** Every file the documentation consists of: path under site/, and its contents. */
export function build() {
  // The front page carries the typeface inside itself; the same two rules go in front of the docs stylesheet.
  const fonts = text(join(root, 'site', 'index.html')).split('\n').filter(line => line.startsWith('@font-face'))
  if (fonts.length !== 2) throw new Error('Expected two @font-face rules in site/index.html.')
  const files = new Map()
  files.set('docs/docs.css', `${fonts.join('\n')}\n${text(join(here, 'docs.css'))}`)
  files.set('docs/docs.js', text(join(here, 'docs.js')))
  PAGES.forEach((page, index) => files.set(`docs/${page.slug ? `${page.slug}/` : ''}index.html`, render(page, index)))
  return files
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [path, contents] of build()) {
    const target = join(root, 'site', path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents)
    console.log(`wrote site/${path}`)
  }
}
