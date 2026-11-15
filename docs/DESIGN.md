# Fotobogen — Design Document

**Name:** Fotobogen (fotobogen.com)
**Author:** Christopher Schweda
**Date:** 2026-11-11 (revised 2026-11-14 after pre-build review; see section 16)
**Status:** Draft for v1

A self-hosted, installable photo website: "WordPress for photos." One person installs it on a small server, answers a few first-run questions, and gets a public photo site plus an admin backend. Skins change how it looks. Modules add image transforms.

---

## 1. Goals and non-goals

### Goals (v1)

- Install on a $6 DigitalOcean droplet (1 vCPU, 1 GB RAM) with no external services.
- First-run setup wizard creates the admin account and basic site settings.
- Public site: thumbnail grid in masonry or square-brick layout; photo view as modal or dedicated page; title, description, and EXIF metadata shown.
- Admin backend: upload, edit, reorder, hide, delete, settings, skins, modules.
- Skins switchable from admin with no rebuild. Ships with one skin: **Swiss**.
- Modules add non-destructive image transforms. Ships with two: **mono** and **tone**.
- Offers 25 sample photos at setup (fetched from Lorem Picsum), removable in one click.
- WCAG 2.2 AA for both public site and admin.

### Non-goals (v1)

- Multiple users or roles (schema allows it; UI does not).
- Albums, tags, search (planned v2; see section 15).
- Comments, likes, sharing features, e-commerce.
- Installing skins or modules by uploading through admin.
- Object storage (a storage adapter interface exists; only the local-disk adapter ships).
- HEIC and RAW input.
- Netlify or any serverless target. The app needs persistent disk and long-running image work.

---

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node 24 LTS | Required by `nuxt-security` 2.7. Pinned in `.nvmrc`, `engines`, and the Dockerfile |
| Framework | Nuxt 4.6 or later (SSR, Nitro node-server preset) | 4.6 introduced the built-in server session used for auth |
| UI | Nuxt UI v4 | Admin uses it heavily; public skin uses it lightly (modal, focus trap). Icons are bundled locally (`@iconify-json/lucide`); nothing loads from a third-party origin at run time |
| Package manager | pnpm | |
| Database | SQLite via `better-sqlite3`, Drizzle ORM | WAL mode; migrations run on boot |
| Images | `sharp` | Concurrency 1, cache off |
| EXIF | `exifr` | |
| Placeholders | `thumbhash` | Stored per photo |
| Auth | Nuxt's built-in `useSession` (from `nuxt/server`) and `node:crypto` scrypt | Sealed-cookie sessions with the secret passed explicitly from `data/secret`. No auth dependency; see section 6 for why `nuxt-auth-utils` is not used |
| Headers / CSP | `nuxt-security` | Headers and CSP only. Its global rate limiter and request-size limiter are switched off (section 6) |
| Tests | Vitest, Playwright, `@axe-core/playwright` | Server and end-to-end tests run against the built server |
| Process | Docker, or pm2 with ecosystem file | Section 14 |
| Proxy | Caddy (quick start) or nginx (Forge, bare metal) | Serves derivatives directly from disk |

Confirm current versions and APIs against live docs before scaffolding; do not rely on remembered syntax for Nuxt or Nuxt UI.

---

## 3. Architecture

One Nuxt app. No separate API service, no worker process. Image processing runs in-process through a SQLite-backed job queue with concurrency 1.

```
fotobogen/
├── app/                    # Nuxt app (pages, components, layouts)
│   ├── pages/
│   │   ├── index.vue           # public grid
│   │   ├── photo/[slug].vue    # public photo page (also the modal's URL)
│   │   ├── setup/              # first-run wizard
│   │   ├── login.vue
│   │   └── admin/              # backend
├── server/
│   ├── api/                # public + admin endpoints
│   ├── db/                 # Drizzle schema, migrations
│   ├── pipeline/           # ingest, derivatives, queue
│   ├── modules/            # module loader + contract
│   ├── skins/              # skin loader
│   └── storage/            # storage adapter interface + local adapter
├── skins/swiss/            # bundled skin
├── modules/mono/           # bundled module
├── modules/tone/           # bundled module
├── seed/                   # manifest.json of 25 Picsum ids; no image files
├── scripts/                # CLI: reset-admin, backup, rebuild.sh
├── deploy/                 # forge-nginx.conf, forge-deploy.sh, Caddyfile
├── Dockerfile
├── docker-compose.yml          # quick start: app + Caddy
├── docker-compose.forge.yml    # Forge: app only, behind host nginx
├── ecosystem.config.cjs
├── LICENSE                 # MIT (code only)
└── data/                   # gitignored; path set by DATA_DIR
    ├── fotobogen.db
    ├── secret              # session secret, generated at first boot
    ├── setup-token         # exists only until setup completes
    ├── originals/
    ├── derivatives/
    ├── skins/              # user-installed skins
    └── modules/            # user-installed modules
```

Everything a site owns lives in `data/`. Backing up or moving a site means copying that directory.

---

## 4. Data model

IDs are random URL-safe strings (nanoid, 12 chars), not autoincrement integers, so URLs do not leak counts or ordering.

**users** — `id`, `username` (unique), `password_hash`, `role` (default `admin`), `session_version` (integer, default 1), `created_at`, `last_login_at`

`session_version` is copied into the session at login and compared on every guarded request. Changing the password increments it, which signs out every existing session. Sealed cookies cannot otherwise be revoked.

**settings** — `key` (PK), `value` (JSON). Keys include `site.title`, `site.tagline`, `site.setup_complete`, `samples.requested` (the wizard's step 5 answer), `layout.grid` (`masonry` | `square`), `layout.photo_view` (`modal` | `page`), `skin.active`, `skin.options`, `privacy.show_exif`, `privacy.show_location` (default false), `privacy.allow_original_download` (default false).

**photos**

| Column | Notes |
|---|---|
| `id`, `slug` (unique) | Slug derived from title, editable |
| `title`, `description`, `alt` | User supplied; all optional at upload |
| `original_path`, `original_filename`, `mime`, `bytes`, `checksum` | SHA-256; used for duplicate detection |
| `width`, `height` | Post-rotation pixel dimensions |
| `thumbhash` | Base64 |
| `taken_at` | From EXIF, editable |
| `camera`, `lens`, `focal_length`, `aperture`, `shutter`, `iso` | Extracted to columns for display |
| `lat`, `lng` | Stored privately; never output unless `privacy.show_location` is on |
| `exif_json` | Full parsed EXIF, for future use |
| `recipe_json` | Ordered list of module transforms (section 10) |
| `status` | `processing` \| `ready` \| `failed` |
| `visibility` | `public` \| `hidden` |
| `is_sample` | Boolean |
| `sort_order` | Integer; manual ordering |
| `created_at`, `updated_at` | |

**derivatives** — `id`, `photo_id`, `kind` (`thumb` | `square` | `medium` | `large`), `format`, `width`, `height`, `path`, `bytes`

**jobs** — `id`, `type` (`ingest` | `rerender`), `photo_id`, `status` (`queued` | `running` | `done` | `failed`), `attempts`, `error`, `created_at`, `started_at`, `finished_at`

**modules** — `name` (PK), `version`, `enabled`

---

## 5. First-run setup

On every request, server middleware checks `site.setup_complete`. If false:

- Page requests redirect to `/setup`.
- `/setup`, `/api/setup/*`, `/api/health`, and static assets pass through. The health endpoint must answer before setup or the Docker `HEALTHCHECK` fails on a fresh install.
- Every other `/api/*` request gets a `503` JSON response, not a redirect.

**Setup token.** At boot, if no user exists, the server reads `data/setup-token`, or generates a random token and writes it there (mode `0600`) if the file is absent. It prints the token to stdout on every boot until setup completes (visible in `pm2 logs` or `docker compose logs app`). A restart therefore never changes the token. The wizard's first screen requires it. Without this, a fresh install is claimable by whoever finds the URL first.

The token is compared in constant time. Wrong-token attempts share the login limit: 5 failures per 15 minutes per IP (section 6).

**Wizard steps**

1. Enter setup token.
2. Site title and tagline.
3. Admin username and password (minimum 12 characters; show strength, do not impose composition rules).
4. Display defaults: grid layout (masonry or square), photo view (modal or page).
5. Sample photos: start empty (the default) or download the 25 samples (section 12).
6. Done: links to the site and to `/admin`. If samples were chosen, a counter shows the download, which runs in the background and never holds up setup; if it fails, the page offers another try or skipping, and leads with skipping after two failures.

**How the wizard submits.** Step 1 checks the token against `POST /api/setup/verify`. Steps 2 to 5 are held in the browser and nothing is written until the final submit, `POST /api/setup/complete`, which carries the token again along with all answers. The server validates everything and returns field-level errors. Abandoning the wizard part-way leaves the install untouched.

On completion, in one database transaction that first re-checks that no user exists: create the user, write settings, set `site.setup_complete`. Then delete `data/setup-token` and log the admin in. A second completion attempt fails. The `/setup` routes and API then return 404 permanently. Step 6 is shown from the completion response, so reloading it afterward is also a 404; that is intended.

**Look.** The wizard and the login page are dark, Swiss in style, and infographic-like: near-black ground, off-white grotesque type, the one red accent, a strict grid, and no rounded corners, shadows, or gradients. Progress is a numbered six-frame contact strip with the current frame in red, matching the og image. Layout choices are picked from small drawn diagrams of each option. This is the first thing an installer sees, so it carries the product's visual identity, which the rest of admin and the bundled skin share (section 11).

The password strength indicator is a small built-in estimate (length and character variety) with a text label. No strength library is bundled.

**Lost password.** No email in v1. `pnpm fotobogen reset-admin` on the server prompts for a new password and signs out all existing sessions (section 4, `session_version`). In Docker: `docker compose exec app node scripts/fotobogen.mjs reset-admin`. The CLI is a plain Node script that shares the hashing and database code with the server and does not need the server running.

---

## 6. Auth and security

- Sessions: sealed cookies, `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day lifetime renewed on use. Session secret generated at first boot into `data/secret` (mode `0600`), so installers set no environment variables.
- Sessions use Nuxt's built-in `useSession` with the secret passed explicitly. `nuxt-auth-utils` (0.6) is not used: it seals only with a secret derived from the `NUXT_APP_SECRET` environment variable, ignores a configured password, and that secret cannot be supplied from a file at startup (tested 2026-11-14). Using it would force every installer to set an environment variable.
- Passwords are hashed with scrypt from `node:crypto`, stored as a self-describing string (parameters, salt, hash) so the parameters can be raised later. The same module is used by the server and the `reset-admin` CLI.
- **`Secure` on localhost.** The cookie always carries `Secure`, except when the request's `Host` is `localhost` or a loopback address. That keeps local development and the no-domain quick start working over plain HTTP. Reaching a server by bare IP or hostname over plain HTTP will not keep a session; that is intended.
- Every `/admin` page and `/api/admin/*` endpoint is guarded by server middleware, not only by client route guards. The guard checks the session's `session_version` against the user row.
- Mutating requests (anything but `GET`, `HEAD`, `OPTIONS`), including login and setup, must carry an `Origin` header whose host equals the request's `Host`. A missing or mismatched `Origin` is rejected with `403`.
- Login rate limit: 5 failures per 15 minutes per IP, in-memory, counting failures only. It is hand-written; a successful login clears the count.
- **Behind a proxy.** The client IP comes from the socket unless `TRUST_PROXY=1`, in which case it is the last address in `X-Forwarded-For`. Both compose files and the pm2 ecosystem file set `TRUST_PROXY=1`, because all three install paths sit behind a proxy on the same host. Without it every visitor would share the proxy's address and one person's failures would lock out everyone. All bundled proxy configs pass `Host` through unchanged.
- CSP and security headers via `nuxt-security`. No third-party origins; fonts are self-hosted. Its global rate limiter (150 requests per 5 minutes) and request-size limiter (2 MB body, 8 MB upload) are disabled: the first would throttle ordinary browsing of a photo grid and the second would block uploads. Upload size is enforced by the upload handler and the proxy instead.
- Uploads: validated by decoding with `sharp`, not by extension or declared MIME type. `limitInputPixels` set (default 100 megapixels). Max upload size configurable (default 50 MB) and mirrored in nginx `client_max_body_size`.
- Originals are stored outside the web root and never served unless `privacy.allow_original_download` is on, and then only through an endpoint.
- Derivatives are re-encoded, which drops all embedded metadata, GPS included. Metadata shown on the site comes from the database and respects the privacy settings.
- Modules are trusted code installed by the server owner on disk. There is no install-by-upload path in v1.

---

## 7. Upload and processing pipeline

**Accepted input:** JPEG, PNG, WebP, TIFF, AVIF.

**Upload (synchronous part)**

1. Stream the multipart body (one file per request, field `file`) to a temp file in `data/tmp/`, which is on the same disk as the originals and is emptied at boot. The file's first bytes must match one of the accepted formats before it is handed to the image library.
2. Compute SHA-256. If a photo with that checksum exists, reject with a "duplicate" result naming the existing photo.
3. Read dimensions with `sharp`; reject if undecodable or over the pixel limit.
4. Move to `data/originals/<id>.<ext>`, insert the `photos` row with `status = processing`, enqueue an `ingest` job, return immediately.

**Ingest job (queued part)**

1. Parse EXIF with `exifr`; fill columns and `exif_json`.
2. Auto-rotate from EXIF orientation; convert to sRGB.
3. Apply `recipe_json` transforms, if any.
4. Write derivatives as WebP:

| Kind | Size | Use |
|---|---|---|
| `thumb` | 480 px wide, aspect preserved | Masonry grid |
| `square` | 480 × 480, `sharp` attention crop | Square-brick grid |
| `medium` | 1280 px long edge | Photo view on small screens |
| `large` | 2560 px long edge | Photo view on large screens |

Never upscale. A size the original cannot fill is made at the original's own size instead, so every photo has a thumb, a square, and a medium; `large` is skipped when it would be identical to `medium`.

The original is decoded once, straight down to a working raster of at most 2560 px on the long edge, and every derivative is made from that. JPEG, ordinary PNG, and TIFF are shrunk as they are read, so even a 100-megapixel original peaks at a few hundred MB (a 40 MP JPEG, PNG, and TIFF peaked at 250 MB in a 1 GB container with no swap). AVIF, WebP, and interlaced PNG are held whole while decoding (measured: AVIF about 27 MB per megapixel), so they have lower pixel limits: 16, 60, and 40 megapixels.

5. Compute thumbhash, set `status = ready`.

**Queue.** One job at a time. `sharp.concurrency(1)` and `sharp.cache(false)` to hold memory flat on 1 GB. On boot, any job left `running` is reset to `queued`. Three attempts, then `failed` with the error stored and shown in admin with a retry button.

**Filenames.** Derivative files include a short content hash (`<id>-large-<hash>.webp`) so nginx can serve them with `Cache-Control: immutable` and a re-render changes the URL.

**Storage adapter.** `put`, `get`, `delete`, `publicUrl`. Only the local adapter ships. Nothing outside `server/storage/` touches the filesystem paths directly.

---

## 8. Public site

**Routes:** `/` (grid), `/photo/[slug]` (photo). That is the whole public surface in v1.

**Grid**

- *Square:* CSS grid of equal cells using the `square` derivative.
- *Masonry:* CSS grid with small fixed `grid-auto-rows` and a per-item row span computed on the server from the stored aspect ratio. This needs no client JavaScript, renders correctly from SSR, and keeps DOM order equal to reading order, which CSS multi-column masonry does not.
- Every tile reserves its space from stored dimensions and paints its thumbhash until the image loads. No layout shift.
- Images use `srcset`, `loading="lazy"`, `decoding="async"`. The first row loads eagerly.
- Pagination by "load more" with a real link fallback (`/?page=2`) so the site works without JavaScript.

**Photo view**

`/photo/[slug]` is always a real, server-rendered page. When `layout.photo_view = modal`, clicking a tile from the grid opens the same content in a modal and pushes that URL; closing returns to the grid at the same scroll position. Visiting the URL directly renders the page. When the setting is `page`, tiles are plain links.

Shown: the image (`medium`/`large` via `srcset`), title, description, date taken, and an EXIF line (camera, lens, focal length, aperture, shutter, ISO) if `privacy.show_exif` is on. Previous and next links, with left and right arrow keys bound.

**Meta.** Per-photo Open Graph tags using the `medium` derivative. A sitemap. An RSS feed of recent photos.

---

## 9. Admin

- **Library:** grid of all photos with status badges (processing, failed, hidden, missing alt text). Multi-select for bulk hide, show, delete. Drag to reorder, with a keyboard-operable alternative (move up, move down, move to top).
- **Upload:** drag-and-drop or file picker, multiple files, per-file progress and result.
- **Edit photo:** title, slug, description, alt text, date taken, visibility. Transform panel (section 10) with live preview. Read-only EXIF panel.
- **Settings:** site title and tagline, grid layout, photo view, privacy toggles.
- **Skins:** list installed skins, activate one, edit its declared options.
- **Modules:** list installed modules, enable or disable.
- **System:** app version, disk usage (originals, derivatives, free space), queue status, "remove sample photos" (shown while any sample remains).

---

## 10. Modules

A module is a folder containing `module.json` and an ES module entry point. Modules are discovered at boot from `modules/` (bundled) and `data/modules/` (user-installed).

```json
{ "name": "mono", "version": "1.0.0", "label": "Monochrome", "entry": "index.mjs" }
```

```js
export default defineModule({
  transforms: [
    {
      id: 'mono',
      label: 'Black and white',
      params: {
        contrast: { type: 'range', min: 0.5, max: 2, step: 0.05, default: 1 },
        tint:     { type: 'select', options: ['neutral', 'warm', 'cool'], default: 'neutral' }
      },
      apply(pipeline, params) {
        // receives a sharp instance, returns a sharp instance
        return pipeline.grayscale().linear(params.contrast, 0)
      }
    }
  ]
})
```

**Contract (v1).** A module contributes named transforms. Each transform declares its parameters as a small schema (`range`, `select`, `boolean`) from which admin builds the controls, and an `apply` function that takes and returns a `sharp` pipeline. That is the only hook type in v1.

**Non-destructive.** Applying a transform appends `{ module, transform, params }` to the photo's `recipe_json` and enqueues a `rerender` job. Derivatives are always generated from the untouched original plus the recipe. Clearing the recipe restores the photo exactly.

**Preview.** The edit screen requests a preview rendered from the `medium` derivative's source size, synchronously, so slider changes feel immediate without queueing.

**Failure handling.** A module that throws on load is marked failed and disabled; the site still boots. A recipe step whose module is missing or disabled is skipped and flagged in admin.

**Bundled modules:** `mono` (grayscale with contrast and tint) and `tone` (a few named looks built from `modulate`, `linear`, and `tint`).

**Later hook types** (not v1): metadata extractors, export targets, public-page blocks. The loader should make adding a hook type a matter of adding a key to `defineModule`.

---

## 11. Skins

A skin is a folder containing `skin.json` and `skin.css`. Skins are discovered from `skins/` (bundled) and `data/skins/` (user-installed). The active skin's CSS is served at a stable route and linked in the public layout, so switching skins needs no rebuild.

```json
{
  "name": "swiss",
  "version": "1.0.0",
  "label": "Swiss",
  "options": {
    "accent":  { "type": "color",  "default": "#e30613" },
    "gutter":  { "type": "select", "options": ["none", "hairline", "wide"], "default": "hairline" },
    "columns": { "type": "range",  "min": 2, "max": 6, "default": 4 }
  }
}
```

**What a skin controls (v1):** CSS custom properties (color, type, spacing, grid gutter, column count), font faces, and its declared options, which admin renders as controls and the server injects as custom-property overrides. The public markup is fixed and documented, with stable class names and landmarks, so a skin can restyle it thoroughly without replacing components.

**What it does not control (v1):** markup or components. Skins that ship their own Vue components would be Nuxt layers and require a rebuild; that is deferred.

**The Swiss skin**

- Strict grid, flush-left ragged-right text, generous white space, no rounded corners, no shadows, no gradients.
- One grotesque sans-serif at a small number of sizes; self-hosted (Inter or similar open-licensed face). Tabular numerals for EXIF data.
- Dark by default: off-white on near-black with a single accent color (red, `#e30613`), used sparingly (current item, focus ring, links on hover). A light variant may be offered as a skin option later.
- Site title top-left, small. Captions and metadata set small in a column beside or under the photo, never over it.
- The photographs supply all the color and texture. The interface stays out of the way.

Skins apply to the public site only. Admin is not skinnable, but it shares the same character: the whole product is Swiss in style, sleek, modern, and dark. Admin uses Nuxt UI in dark mode with a neutral grey scale, the red accent as its primary color, square corners, and no shadows or gradients.

---

## 12. Sample photos

Same approach as openMantel: fetched from Lorem Picsum by fixed id, never committed.

- `seed/manifest.json` (committed) lists 25 Picsum photo ids with a requested width and height each, plus a title, description, and alt text. Fixed ids mean every install gets the same set.
- The shape mix is deliberate so both grid layouts look right out of the box: roughly 10 landscape, 7 portrait, 4 square, 2 panoramic, 2 very tall. Long edge 2560 px.
- One fetch routine, used two ways: `pnpm seed:fetch` on the command line for development, and wizard step 5 during setup. It downloads into a temp directory, skips files already present, retries once per photo, then pushes each file through the normal ingest pipeline flagged `is_sample`.
- **Credits.** Picsum serves Unsplash photographs and exposes each one's author and Unsplash URL through its info endpoint. The fetch routine reads that and writes "Photo by … on Unsplash" into the sample's description, so credit shows on the photo page.
- **Licensing.** No photographs live in the repository or the Docker image, so the MIT `LICENSE` covers everything that ships. `seed/README.md` notes that the downloaded samples are Unsplash photos under the Unsplash License and are meant as placeholders.
- **Failure.** If the server is offline or Picsum is unreachable, setup completes with an empty library and says so. The download gives up after the first three photos fail rather than waiting out every timeout. The admin can try again, cancel a running download, or skip; nobody is left retrying a service that is down. The admin dashboard always offers "Download sample photos" while any are missing.
- This is the app's only outbound request, and it happens only when the admin asks for it.
- "Remove sample photos" in admin deletes all flagged rows and their files in one action.

---

## 13. Accessibility

Target: WCAG 2.2 AA, public site and admin.

- Alt text is its own field. Admin flags photos missing it and offers a filter to find them. Fallback order for the `alt` attribute: alt, then title, then empty with the photo's link carrying an accessible name.
- Modal: focus moves in on open, is trapped, and returns to the originating tile on close. Escape closes. The page behind is inert.
- Grid DOM order matches visual reading order (see section 8).
- All admin drag interactions have keyboard equivalents.
- Skin tokens are checked for contrast when a skin loads; admin warns if text-on-background pairs fall below 4.5:1.
- `prefers-reduced-motion` disables transitions.
- Automated axe checks in CI for the grid, the photo page, the modal, setup, login, and the main admin screens. Each screen's check is added in the phase that builds the screen, starting with setup and login in Phase 1.

---

## 14. Deployment and operations

Three supported install paths. All three use the same `data/` directory layout, so a site can move between them by copying that directory.

### 14.1 The image

- One multi-stage `Dockerfile`. Base is Node 24 LTS on Debian slim, not Alpine, so `sharp` and `better-sqlite3` use their prebuilt glibc binaries.
- Runs as a non-root user whose UID and GID are set at run time (`user: "${PUID:-1000}:${PGID:-1000}"` in compose, with `PUID` and `PGID` optional in `.env`), so files in a bind-mounted `data/` are owned by the host user.
- The image includes `scripts/fotobogen.mjs`, so the CLI runs with `docker compose exec app node scripts/fotobogen.mjs <command>`.
- Database migration files ship inside the server build, so the image needs nothing but `data/` mounted.
- `HEALTHCHECK` calls `/api/health`.
- A GitHub Actions workflow builds and publishes the image to GHCR on every tagged release. Both compose files pull that image by default. Building Nuxt on a 1 GB droplet can run out of memory, so installers should never have to build.
- The app can always serve `/media/` itself. A proxy serving those files from disk is an optimization, never a requirement.
- The setup token appears in `docker compose logs app`.

### 14.2 `docker-compose.yml` — quick start

For a fresh server with nothing installed but Docker.

- Services: `app` and `caddy`.
- Caddy terminates TLS, obtains certificates automatically, and proxies to `app`. It serves `/media/` directly from the shared data volume.
- Configured by a `.env` file with one required value, `DOMAIN`. With `DOMAIN` unset it serves plain HTTP on localhost for trying it out; setup and login work there because of the localhost cookie rule in section 6.
- Sets `TRUST_PROXY=1` on `app`.
- Data lives in `./data` beside the compose file.
- Install: clone or download the compose file, set `DOMAIN`, `docker compose up -d`, read the token from the logs, open the site.
- Update: `docker compose pull && docker compose up -d`.

### 14.3 `docker-compose.forge.yml` — Laravel Forge

For a Forge-provisioned server where nginx already owns ports 80 and 443 and Forge manages certificates.

- One service: `app`. No proxy container.
- Publishes the app on `127.0.0.1:${PORT:-5150}` only, never on a public interface. Sets `TRUST_PROXY=1`.
- `data/` is bind-mounted from the Forge site directory, and the container runs as the `forge` user's UID and GID so host nginx can read derivatives directly.
- `deploy/forge-nginx.conf` is a ready-made server-block snippet: proxy to the local port passing `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`, serve `/media/` from the site's `data/derivatives/` with immutable caching, set `client_max_body_size` to match the upload limit.
- `deploy/forge-deploy.sh` is the Forge deploy script: `git pull`, `docker compose -f docker-compose.forge.yml pull`, `up -d`.
- README covers the one-time steps: install Docker on the server, add the `forge` user to the `docker` group, create the site, paste the nginx snippet, issue the certificate through Forge.

### 14.4 Bare metal with pm2

For running without Docker, and for development servers.

- Requires Node 24 LTS on the server.
- `ecosystem.config.cjs` runs the Nitro server on a local port with `DATA_DIR` and `TRUST_PROXY=1` set.
- The same `deploy/forge-nginx.conf` snippet applies.
- `scripts/rebuild.sh`: `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, `pm2 reload`.

### 14.5 Operations (all paths)

- Add 2 GB of swap on a 1 GB droplet.
- Database migrations run automatically at boot.
- `pnpm fotobogen backup` writes a consistent SQLite backup (`VACUUM INTO`) plus a manifest; originals are backed up by copying `data/originals/`. Derivatives can always be regenerated.
- `/api/health` returns version, database status, and queue depth for uptime monitoring.
- README documents a from-zero install for someone who is not the author.

---

## 15. Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 | Scaffold, data directory, database, migrations, health endpoint, Dockerfile, both compose files, Forge nginx snippet, pm2 config, MIT `LICENSE` | App boots on a clean machine and creates `data/`, both natively and with `docker compose up` |
| 1 | Setup token, wizard, login, session guard, `reset-admin` CLI | Fresh install can be claimed only with the token; `/setup` is dead afterward |
| 2 | Upload (API and a minimal upload page), ingest queue, derivatives, EXIF, thumbhash, storage adapter, `/media/`, sample manifest and `pnpm seed:fetch`, sample download in the wizard and dashboard | A 40 MP JPEG processes on a 1 GB droplet without the process being killed |
| 3 | Public grid (both layouts), photo page and modal, Swiss skin, skin loader | Site is presentable with sample photos; no layout shift; works without JavaScript |
| 4 | Admin: library, edit, bulk actions, reorder, settings, skins, system | Every v1 setting is changeable from admin |
| 5 | Module loader, recipe model, preview, `mono` and `tone` | A transform can be applied, previewed, and fully reverted |
| 6 | Accessibility audit, README install guide, backup CLI | A stranger can install from the README |

**v2 candidates:** a slideshow (if added, follow how openMantel, `cschweda/openmantel`, runs its slideshow), albums and tags, search, multiple users, object storage adapter, AVIF output, HEIC input, layer-based skins, more hook types, install skins and modules from admin.

---

## 16. Decisions

- **Name:** Fotobogen. German for "photo sheet", as in a contact sheet (*Kontaktbogen*).
- **Licence:** MIT for the code.
- **Sample photos:** fetched from Lorem Picsum by fixed id, as in openMantel; not committed (section 12).
- **Install paths:** Docker quick start, Docker on Forge, and bare-metal pm2 (section 14).
- **Repository and image:** `github.com/cschweda/fotobogen` (public); image at `ghcr.io/cschweda/fotobogen`.
- **Placeholder site:** the single page at fotobogen.com lives in `site/` and doubles as a visual guide to the software (screens from the current build, where it runs, what is built). The Netlify site has been linked to this repository's `main` branch since 2026-11-14. `netlify.toml` publishes only that folder and skips the build when nothing in it changed, so only changes to the page cost a production deploy. Fotobogen itself never runs on Netlify (section 1).

**Revised 2026-11-14, after checking the stack against current releases and before any code:**

- **Dark, Swiss look everywhere:** wizard, login, admin, and the bundled skin (sections 5 and 11). Requested 2026-11-14.
- **Auth without `nuxt-auth-utils`.** Nuxt's built-in session plus `node:crypto` scrypt, so the secret can live in `data/secret` (sections 2 and 6).
- **Node 24 LTS** throughout, required by `nuxt-security` (section 2).
- **`nuxt-security` for headers and CSP only;** its rate and size limiters are off (section 6).
- **Setup token persists across restarts** until setup completes (section 5).
- **Setup redirect exempts `/api/health` and `/api/setup/*`;** other API routes return `503` (section 5).
- **Wizard writes nothing until the final submit,** which is one transaction (section 5).
- **`Secure` cookies everywhere except localhost** (section 6).
- **`TRUST_PROXY=1`** set by every shipped deployment file; off by default (section 6).
- **`users.session_version`** added so a password reset signs out old sessions (section 4).
- **Setup-token attempts are rate limited** like logins (section 5).

**Revised 2026-11-15, while building Phase 2:**

- **Small originals** get derivatives at their own size rather than none (section 7).
- **A minimal upload page and the `/media/` route ship in Phase 2,** so uploads can be tried by hand before the admin library exists.
- **Sample download moved from Phase 6 to Phase 2,** wired into the wizard and the dashboard, with progress, cancel, retry, and skip. Starting empty is the wizard's default (sections 5 and 12). Requested 2026-11-15.
- **`pnpm seed:fetch` is a development command.** It needs a source checkout and is not in the Docker image; a running site uses the dashboard.
- **Upload limits** are `MAX_UPLOAD_MB` and `MAX_MEGAPIXELS`.
- **Windows is a tested platform** for the Node install path: CI installs, builds, and tests there. `better-sqlite3` is no longer compiled at install time on any platform.
- **Modules brought forward from Phase 5.** The loader, the recipe model, preview, and the admin pages for them ship now, with two bundled modules: `filmframe` and `filmlooks` (in place of `mono` and `tone`). Requested 2026-11-15.
- **Module contract.** `apply(image, params, context)` may be asynchronous and may change the picture's size; `context` carries the picture's dimensions and the `sharp` function, so an installed module needs no dependencies. A transform's output is capped at 40 megapixels.
- **All modules start switched off.** A site-wide recipe (`modules.site_recipe`) applies to every photo without its own; a photo's own recipe, even an empty one, wins.
- **The top-level `modules/` folder** is Fotobogen's, so Nuxt's own build-module folder is renamed (`dir.modules`).
- **Admin is not rebuilt for a module.** Controls come from each module's declared parameters; `docs/MODULES.md` is the author's guide.
- **One configuration file.** `fotobogen.config.js` holds every app-wide value, split into "okay to change" and "do not touch". Precedence: environment, then `.env`, then the file. `.env` is not committed; `.env.sample` is. Requested 2026-11-15.
- **Port 5150** by default, everywhere. An unset port moves up when busy; a set port is exact.
- **Launcher and preflight.** `scripts/start.mjs` (run by `pnpm start`, the Docker image, and pm2) reads `.env`, runs the preflight check, deals with copies already running, picks the port, and loads the server. A failed check stops the start. Tested platforms: Ubuntu and Debian, macOS, Windows.
- **Running copies** are recorded in `~/.fotobogen/instances/`. Two copies may not share a data directory.
- **`/api/health`** answers `GET` and `HEAD` with `status`, `version`, `database`, `queue.depth`, and `uptime`.
- **Public site built (Phase 3).** Skin rules start from the class `fb-public` on `<html>`, so a skin and the admin stylesheet cannot interfere. The masonry grid uses container-query units: one row is a twentieth of a column's width and each tile spans the rows its shape needs. The Swiss skin uses the system sans-serif rather than shipping font files.
- **Only setup, login, and the admin are `noindex`.** Public pages are indexable and listed in the sitemap.
- **Feature roadmap** agreed 2026-11-15: `docs/ROADMAP.md`.
- **Albums and tags (migration 0001).** Tables `albums`, `album_photos` (with a position per album), `tags`, and `photo_tags`. An album has its own order and visibility; a tag is dropped when no photo carries it. Public pages: `/albums`, `/album/<slug>`, `/tag/<slug>`. Only photos a visitor may see count toward an album or tag.
- **Backup and restore.** A backup is a zip of a `VACUUM INTO` snapshot, `originals/`, and installed skins and modules, with a manifest naming the migrations it needs; it never contains the session secret or derivatives. A restore uploaded in the admin is staged as `data/restore-pending.zip` and applied at the next boot, before the database is opened; the CLI applies it directly with the app stopped. Either way the previous data is moved to `before-restore-<time>/`, and every photo is queued to be rendered again.
- **Scheduled publishing (migration 0002).** `photos.publish_at`: a public photo with a time in the future is treated as not public by every public query, which compare it with the clock at the moment they run, so nothing has to wake up to publish it. The setting `uploads.default_visibility` makes new uploads start hidden (drafts).
- **Slideshow** moved from the v2 candidates into v1 (requested 2026-11-15), following openMantel's player: preload then cross-fade between two stacked images, endless laps with random order reshuffled each lap, details on a press that also holds the photo, screen wake lock, no location. Timing (`slideshow.seconds`, default 8) and order (`slideshow.order`) are settings. It can always be paused and stepped by hand (WCAG 2.2.2).
