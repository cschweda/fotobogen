// `fotobogen import <folder>`: bring a folder of photos into this site.
//
// The photos go in through the running site, exactly as an upload from the
// admin does, so every rule of an upload applies: the formats and limits,
// duplicates, the words read from inside a file, drafts or public as
// Settings says, the site-wide look, and webhooks.
//
// To be let in, the command makes itself a pass: an API token, written
// straight into this site's database, used for this one run, and removed at
// the end whatever happens. The pass is only ever sent to this machine, and
// only after the program at the other end has proved it is this site
// (server/core/import-pass.ts says how).
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, constants, createReadStream, fstatSync, lstatSync, openSync, readdirSync } from 'node:fs'
import { request } from 'node:http'
import { basename, join, relative, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { newId } from '../server/core/ids.ts'
import { CHALLENGE_KEY, CHALLENGE_MS, PASS_HOURS, PASS_NAME, proofFor, sameText } from '../server/core/import-pass.ts'

export const IMPORT_USAGE = `Usage: fotobogen import <folder> [--album <name>] [--albums] [--url <address>]

  <folder>          The folder to import. Folders inside it are included.
  --album <name>    Put every photo in this album (made if it is not there).
  --albums          Make an album of each folder directly inside <folder>,
                    named after it, and put that folder's photos in it.
  --url <address>   Where the site is running on this machine.
                    Default: http://127.0.0.1:<PORT>, PORT being 5150 unless set.

Fotobogen must be running. Photos already in the library are skipped.`

const EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'avif', 'heic', 'heif'])
/** Deep enough for any real collection; a folder that goes deeper is more likely a mistake or a loop. */
const MAX_DEPTH = 12
const MAX_FILES = 20_000

/** The photos under a folder, in name order. Hidden files and folders, links, and other kinds of file are left out. */
export function findPhotos(root) {
  const found = []
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return
    for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
      if (name.startsWith('.') || found.length >= MAX_FILES) continue
      const path = join(dir, name)
      // lstat, not stat: a link is never followed, so nothing outside the folder is ever read.
      const kind = lstatSync(path)
      if (kind.isDirectory()) walk(path, depth + 1)
      else if (kind.isFile() && EXTENSIONS.has(name.split('.').pop().toLowerCase())) found.push(path)
    }
  }
  walk(root, 0)
  return found
}

/** One request to the site. A file is streamed, never read whole into memory. */
function send(site, { method, path, token, json, file }) {
  return new Promise((done, failed) => {
    const headers = { accept: 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    // With the admin at an address of its own (ADMIN_HOST), the site answers the admin's requests only by that name.
    if (site.adminHost) headers.host = site.adminHost
    let body
    const boundary = `----fotobogen${randomBytes(12).toString('hex')}`
    let size = 0
    if (json !== undefined) {
      body = Buffer.from(JSON.stringify(json))
      headers['content-type'] = 'application/json'
      headers['content-length'] = body.length
    }
    else if (file) {
      // The name goes in a header: keep it to one line, with nothing that could end the header early.
      const name = basename(file.path).replace(/["\r\n\\]/g, '_')
      const head = Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${name}"\r\ncontent-type: application/octet-stream\r\n\r\n`)
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
      size = file.size
      headers['content-type'] = `multipart/form-data; boundary=${boundary}`
      headers['content-length'] = head.length + size + tail.length
      body = { head, tail }
    }
    const outgoing = request({ host: site.hostname, port: site.port, method, path, headers }, (response) => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        let parsed = {}
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        catch { /* an answer that is not JSON has only its status to go by */ }
        done({ status: response.statusCode ?? 0, body: parsed })
      })
      response.on('error', failed)
    })
    outgoing.on('error', failed)
    // An upload is processed after it is answered; nothing here takes long unless the site has stopped.
    outgoing.setTimeout(300_000, () => outgoing.destroy(new Error('The site stopped answering.')))
    if (Buffer.isBuffer(body)) outgoing.end(body)
    else if (body) {
      outgoing.write(body.head)
      // Read from the file that was opened and checked, not from its name: the name could since have been pointed elsewhere.
      createReadStream(null, { fd: file.fd, autoClose: true }).on('error', error => outgoing.destroy(error)).on('end', () => outgoing.end(body.tail)).pipe(outgoing, { end: false })
    }
    else outgoing.end()
  })
}

/**
 * Opens a photo to send it. Null for what is not a plain file of this
 * folder's own: a link put in its place since the folder was listed, or a
 * second name for a file that lives somewhere else (a hard link).
 */
function openPhoto(path) {
  let fd
  try {
    // O_NOFOLLOW: a link is refused here, not followed. (Windows has no such flag, and there making a link takes rights an ordinary user lacks.)
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    const kind = fstatSync(fd)
    if (kind.isFile() && kind.nlink === 1) return { path, fd, size: kind.size }
  }
  catch { /* gone, or a link */ }
  if (fd !== undefined) closeSync(fd)
  return null
}

const sleep = ms => new Promise(done => setTimeout(done, ms))
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * Runs the import. `fail` makes the error the command-line tool prints in
 * red; `log` prints a line. Returns the process's exit code.
 */
export async function importFolder(args, { dbPath, env, log, fail }) {
  const options = { album: null, albums: false, url: null }
  const rest = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--albums') options.albums = true
    else if (arg === '--album' || arg === '--url') {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw fail(`${arg} needs a value.\n\n${IMPORT_USAGE}`)
      options[arg.slice(2)] = value
    }
    else if (arg.startsWith('--')) throw fail(`Unknown option: ${arg}\n\n${IMPORT_USAGE}`)
    else rest.push(arg)
  }
  if (rest.length !== 1) throw fail(IMPORT_USAGE)
  if (options.album !== null && options.albums) throw fail('Use --album or --albums, not both.')
  const folder = resolve(rest[0])
  let isFolder = false
  try { isFolder = lstatSync(folder).isDirectory() }
  catch { /* not there */ }
  if (!isFolder) throw fail(`${rest[0]} is not a folder.`)

  let address
  try { address = new URL(options.url ?? `http://127.0.0.1:${env.PORT || 5150}`) }
  catch { throw fail(`${options.url} is not an address. Give one like http://127.0.0.1:5150.`) }
  // The pass this command makes opens this site's library. It is sent nowhere but this machine, and never over a plain connection to anywhere else.
  // Only the three plain names of this machine: no other name is trusted to mean it.
  if (address.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname.toLowerCase()) || address.username || address.password) {
    throw fail(`fotobogen import only talks to a site on this machine, at an address such as http://127.0.0.1:5150. ${address.origin} is somewhere else. Run the command on the server the site is on.`)
  }
  // "localhost" is dialled as 127.0.0.1, so that it cannot be answered from the machine's other loopback address.
  const hostname = address.hostname.toLowerCase() === 'localhost' ? '127.0.0.1' : address.hostname.replace(/^\[|\]$/g, '')
  const site = { hostname, port: Number(address.port || 80), origin: address.origin, adminHost: env.ADMIN_HOST || '' }

  const files = findPhotos(folder)
  if (files.length === 0) throw fail(`No photos were found in ${folder}. Fotobogen takes JPEG, PNG, WebP, TIFF, AVIF and HEIC files.`)

  const db = new Database(dbPath, { fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  const setting = db.prepare(`insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value`)
  const forget = db.prepare(`delete from settings where key = ?`)
  const tokenId = newId()
  // Albums are a change to the library; uploading alone is not. The pass is no wider than the run needs.
  const scope = options.album !== null || options.albums ? 'manage' : 'upload'
  const removePass = () => {
    db.prepare(`delete from api_tokens where id = ?`).run(tokenId)
    forget.run(CHALLENGE_KEY)
  }
  // A pass left by a run that was killed: the site already refuses it; clear it away.
  db.prepare(`delete from api_tokens where name like ? and length(name) > 60 and created_at < ?`).run(`${PASS_NAME}%`, Date.now() - PASS_HOURS * 3600_000)
  // Ctrl+C, a closed terminal, or a stop from the system in the middle still takes the pass away.
  const interrupted = () => {
    try { removePass() }
    catch { /* the database is closing */ }
    process.exit(130)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, interrupted)

  try {
    // First, with nothing secret sent: is the program at that address this site?
    const nonce = randomBytes(24).toString('base64url')
    const key = randomBytes(32).toString('base64url')
    setting.run(CHALLENGE_KEY, JSON.stringify({ nonce, key, expires: Date.now() + CHALLENGE_MS }))
    let proof
    try { proof = await send(site, { method: 'GET', path: `/api/import-proof?nonce=${nonce}` }) }
    catch { throw fail(`Fotobogen is not running at ${site.origin}. Start it, or say where it is with --url.`) }
    forget.run(CHALLENGE_KEY)
    if (proof.status === 503) throw fail('This site has not been set up yet. Open it in a browser and finish setup first.')
    if (proof.status !== 200 || typeof proof.body.answer !== 'string' || !sameText(proof.body.answer, proofFor(key, nonce, site.hostname, site.port))) {
      throw fail(`The program answering at ${site.origin} is not the site whose data is in ${dbPath}. Nothing was sent to it. Run the command in that site's own folder, or set DATA_DIR, or give the site's own address with --url.`)
    }

    // Now the pass, known to be going to this site.
    const token = `fb_${randomBytes(32).toString('base64url')}`
    db.prepare(`insert into api_tokens (id, name, token_hash, prefix, scope, created_at) values (?, ?, ?, ?, ?, ?)`)
      .run(tokenId, `${PASS_NAME} (${new Date().toISOString()})`, createHash('sha256').update(token).digest('hex'), token.slice(0, 9), scope, Date.now())
    const first = await send(site, { method: 'GET', path: '/api/admin/photos?ids=none', token }).catch(() => ({ status: 0, body: {} }))
    if (first.status !== 200) throw fail(`The site at ${site.origin} answered ${first.status}${first.body.message ? `: ${first.body.message}` : '.'}`)

    log(`Importing ${plural(files.length, 'photo')} from ${folder}`)
    const taken = [] // { file, id } for every photo now in the library: new, or already there
    const refused = []
    let added = 0
    let already = 0
    for (const [index, file] of files.entries()) {
      const name = relative(folder, file)
      const opened = openPhoto(file)
      if (!opened) {
        refused.push(`${name}: left alone, because it is a link to a file somewhere else.`)
        continue
      }
      let answer
      try { answer = await send(site, { method: 'POST', path: '/api/admin/photos', token, file: opened }) }
      catch (error) { throw fail(`The site stopped answering while ${name} was being sent (${error.message}). ${added} added so far; run the command again to carry on: what is already in is skipped.`) }
      if (answer.status === 200 && answer.body.photo?.id) {
        added++
        taken.push({ file, id: answer.body.photo.id })
      }
      else if (answer.status === 409 && answer.body.existing?.id) {
        already++
        // In the trash it is not in the library, and is not put in an album.
        if (!answer.body.existing.trashed) taken.push({ file, id: answer.body.existing.id })
      }
      else refused.push(`${name}: ${answer.body.message ?? `the site answered ${answer.status}`}`)
      if ((index + 1) % 25 === 0 || index + 1 === files.length) log(`  ${index + 1} of ${files.length} sent`)
    }

    // Albums.
    const wanted = new Map() // album title -> photo ids
    if (options.album !== null) wanted.set(options.album, taken.map(photo => photo.id))
    if (options.albums) {
      for (const photo of taken) {
        const parts = relative(folder, photo.file).split(sep)
        if (parts.length < 2) continue // a photo in the folder itself belongs to no album
        // A folder's name becomes an album's title: without characters that cannot be seen or that turn text around.
        const title = parts[0].replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim()
        if (title) wanted.set(title, [...(wanted.get(title) ?? []), photo.id])
      }
    }
    if (wanted.size > 0) {
      const listed = await send(site, { method: 'GET', path: '/api/admin/albums', token })
      const existing = new Map((listed.body.albums ?? []).map(album => [album.title, album.id]))
      for (const [title, ids] of wanted) {
        if (ids.length === 0) continue
        let albumId = existing.get(title.trim())
        if (!albumId) {
          const made = await send(site, { method: 'POST', path: '/api/admin/albums', token, json: { title } })
          if (!made.body.id) {
            refused.push(`Album "${title}": ${made.body.errors?.title ?? made.body.message ?? `the site answered ${made.status}`}`)
            continue
          }
          albumId = made.body.id
        }
        for (let from = 0; from < ids.length; from += 200) {
          await send(site, { method: 'POST', path: '/api/admin/photos/bulk', token, json: { ids: ids.slice(from, from + 200), action: 'add-to-album', album: albumId } })
        }
        log(`Album "${title.trim()}": ${plural(ids.length, 'photo')}`)
      }
    }

    // Wait until the site has made the web copies, then say which, if any, it could not.
    if (added > 0) {
      log('Waiting for the site to resize them...')
      for (let waited = 0; waited < 6 * 3600; waited++) {
        const health = await send(site, { method: 'GET', path: '/api/health', token }).catch(() => ({ body: {} }))
        if ((health.body.queue?.depth ?? 0) === 0) break
        await sleep(1000)
      }
      const failed = await send(site, { method: 'GET', path: '/api/admin/photos?show=failed', token })
      const ours = new Set(taken.map(photo => photo.id))
      for (const photo of failed.body.photos ?? []) {
        if (ours.has(photo.id)) refused.push(`${photo.filename}: uploaded, but could not be processed${photo.error ? ` (${photo.error})` : ''}. See it under Admin, Library, "Failed".`)
      }
    }

    log(`${added} added, ${already} already in the library, ${refused.length} refused.`)
    for (const line of refused) log(`  ${line}`)
    return refused.length > 0 ? 1 : 0
  }
  finally {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, interrupted)
    removePass()
    db.close()
  }
}
