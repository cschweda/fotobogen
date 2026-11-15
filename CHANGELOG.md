# Changelog

All notable changes to Fotobogen are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Nuxt 4 application scaffold on Node 24 with Nuxt UI and security headers.
- `netlify.toml` for the fotobogen.com placeholder page, which now lives in `site/`.
- MIT licence.
- `.nvmrc` pinning Node 24.
- Data directory (`DATA_DIR`, default `./data`) created at boot with the SQLite database (WAL mode), session secret, and automatic migrations.
- Complete v1 database schema.
- `/api/health` reporting version, database status, and queue depth.
- One-time setup token, printed at every boot until setup is complete.
- Six-step setup wizard: dark, Swiss in style, keyboard-operable, checked against WCAG 2.2 AA.
- Admin login and logout with sealed-cookie sessions, a server-side guard on `/admin` and `/api/admin/*`, an Origin check on every changing request, and a limit of 5 failed attempts per 15 minutes per address.
- `pnpm fotobogen reset-admin` to set a new admin password from the server and sign out every session.
- Placeholder admin dashboard and public page.
- Docker image, quick-start compose file with Caddy, compose file and nginx snippet for Laravel Forge, pm2 process file, and rebuild script.
- GitHub Actions: tests on every pull request, and image publishing to GHCR on version tags.
- Sessions renew for another 30 days each time they are used.
- `pnpm typecheck`, run in CI.
- Screenshots of the setup wizard, login, and admin placeholder in the README.
- The social card (`site/og.png`) now says what the name means: German for "photo sheet", as in a contact sheet. Its source is `docs/og/og.html`.
- fotobogen.com is now a visual guide: real screens from the installer, a diagram of where the software runs, and what is built so far.
- Uploading from the admin: JPEG, PNG, WebP, TIFF, and AVIF, judged by content; 50 MB and 100 megapixel limits (`MAX_UPLOAD_MB`, `MAX_MEGAPIXELS`); duplicates refused by checksum.
- Background processing, one photo at a time: EXIF read into the database, rotation, sRGB, WebP copies at four sizes with content-hashed names, and a thumbhash placeholder. Interrupted work resumes after a restart; three failed tries mark a photo failed, with a retry button.
- Lower pixel limits for formats that must be held whole in memory to open: AVIF 16 megapixels, WebP 60, interlaced PNG 40. The refusal says so and suggests JPEG.
- `/media/` serves the resized copies, so a proxy serving them from disk is optional.
- Storage adapter interface with a local-disk adapter.
- Sample photos: 25 placeholders from Lorem Picsum, downloaded only on request, from the setup wizard (default is to start empty), the dashboard, or `pnpm seed:fetch`. A counter shows progress; a failed download can be retried, cancelled, or skipped; samples can be removed in one click.
- Modules: transforms that change how photos look, loaded at startup from `modules/` (bundled) and `data/modules/` (installed), with no rebuild. Each declares its parameters and the admin builds the controls. All modules start switched off.
- Film frame module: a contact-print look with the negative's border, sprocket holes, a ragged or straight edge, and made-up film-stock markings.
- Film looks module: tone and grain in the manner of classic and pushed black-and-white film, a colour slide, and a soft colour negative.
- Transforms can be set for all photos or for one photo, with a live preview; the uploaded file is never changed.
- `docs/MODULES.md`: how to write and install a module.
- `fotobogen.config.js`: every app-wide setting in one commented file, in an "okay to change" part and a "do not touch" part. The environment and `.env` override it.
- `pnpm start`: a launcher that reads `.env`, runs a preflight check, and starts the server.
- Preflight check before every start (also `pnpm preflight`): Node version, operating system, processor, memory, disk space, data directory, and the image and database libraries. A failure stops the start and says what to fix.
- Default port 5150. If it is busy, the next free port above it is used; a port set in `.env` is used exactly.
- Running copies are detected: in a terminal Fotobogen asks whether to run both, replace the running one, or cancel; two copies can never share a data directory.
- `/api/health` now reports `status` and `uptime`, and answers `HEAD` for uptime monitors.
- The public site: a photo grid (masonry or square, laid out by CSS with no JavaScript needed, with blurred placeholders and no layout shift) and a page for each photo, which can also open in a modal over the grid.
- Skins: the bundled Swiss skin, a loader for skins in `data/skins/`, options that become CSS custom properties, a contrast check, and an admin page. `docs/SKINS.md` is the guide.
- Social-card tags on every photo page, an RSS feed (`/feed.xml`), a sitemap, and `robots.txt`.
- `docs/ROADMAP.md`: the agreed feature list and its status.
- The photo library: reorder by dragging or with keyboard buttons; hide, show, or delete several photos at once; filters for hidden photos, missing alt text, and failures.
- Editing a photo: title, description, alt text, web address, date taken, and visibility, with what the file recorded shown beside it.
- A strip of look previews under each photo, built from the switched-on modules.
- A settings page: site title and tagline, grid layout, photo view, and the privacy switches.
- Albums: named sets of photos with their own public pages, managed from the admin, filled from the library or a photo's page.
- Tags: labels on photos, each with a public page; added one photo at a time or to several at once.
- Backup and restore: download a zip of the database, the uploaded photos, and installed skins and modules from **Admin, System**, or with `pnpm fotobogen backup`; restore from the admin (applied at the next start) or with `pnpm fotobogen restore`. What a restore replaces is kept in a `before-restore` folder.
- A System page: version, what is stored, and free space.
- Scheduled publishing: a photo can be set to go public at a date and time, and appears by itself when it comes.
- Drafts: a setting makes new uploads start hidden until published.
- Slideshow: a full-screen player for the whole site, an album, or a tag, with preloading, cross-fade, pause, keyboard control, and details on demand; timing and order are settings.
- Licences: a site-wide licence (all rights reserved or Creative Commons), shown on each photo page, which a photo can override.
- Downloads: visitors can download photos when the site or a photo allows it. A download is a large copy with no camera data; the file as uploaded is handed out only by a site that shows where photos were taken.
- Watermark module: a line of text in a corner of each photo.
- Modules can declare a `text` parameter.
- A one-time notice in the admin: backups are the owner's responsibility and the software comes with no warranty. The admin opens once "I understand" is pressed.
- Update notice: the admin can check GitHub for a newer release, on request or (if switched on) once a day; the dashboard says when one exists.
- fotobogen.com shows the gallery, a photo page, film looks, and the library, and sends named events to Plausible for use as goals.
- Two more skins, Papier and Plakat (a poster), with a guide to making a skin from one of them.
- Every skin has a light and a dark mode. The owner chooses which visitors see first, or lets it follow each visitor's device; a button in the header lets a visitor switch. A skin's colours now live in `skin.json` under `modes`, and a colour option holds one colour for each mode.
- A skin can bring a look for every photo (`look` in `skin.json`). Choosing the skin sets it as the site-wide look and switches on the modules it needs; the owner can decline it, change it, or switch it off, and a photo can still have its own.
- Rangefinder Dreams: a fourth skin, black and white throughout, which shows every photo in black and white.
- A sharpening slider on every bundled module. Film looks sharpens normally by default; the frame and the watermark leave the photo alone unless asked.
- The bundled skins are tested in both modes at phone and desktop widths against WCAG 2.1 AA, including a measured contrast check on every heading and link.
- `pnpm fotobogen module new <name>` starts a module from a working example, and `pnpm fotobogen module test <name>` runs it on a test picture and reports what is wrong.
- A documented public API (`docs/API.md`): read-only JSON for photos, albums, tags, and the slideshow, readable from other sites, with a version header.
- `docs/UPGRADING.md`: how to upgrade, what a version number promises, and how to go back.
- Webhooks: signed JSON messages when a photo is uploaded, goes live (including on a schedule), or is deleted; managed under **Admin, Webhooks**, with retries and a test button. Private-network addresses are refused unless `WEBHOOKS_ALLOW_PRIVATE=1`.
- Site text: an admin page where the site's title, tagline, language, and every fixed piece of text on the public pages can be put in the owner's own words, with a line of their own for the footer. No public page says "Fotobogen"; a site with no title is called "Photographs".
- Search and sharing: an admin page for the home page's title, the site's description, how page titles are written, the picture shown when the site is shared, whether search engines may list the site, the site's proper address, author and X username, and Google and Bing verification codes, with previews.
- A Links panel on each photo's page in the library: the full address of the photo's page and of each size of the picture, and HTML to embed it, each with a Copy button.
- `SITE_URL`: the site's proper address can be set on the server as well as in the admin, and is used for every full address the site writes out. The admin says when links still point at localhost and how to fix it.
- Pages that cannot be shown (not found, or a failure) use the site's own frame, name, and words.
- Demo mode (`DEMO_MODE=1`): for a site that shows Fotobogen off. Anyone can log in as `demo` / `demo` and open every admin page, but every change is refused by the server, and backups, restore, API tokens, webhooks, and photo locations are kept from them. The owner's login keeps full control.
- README and docs: a complete nginx site file for an install without Docker, with each line explained and a table of what goes wrong; pm2 start-on-boot; and step-by-step Laravel Forge with pm2 (no Docker), including the deploy script.
- API tokens: made in the admin, shown once, stored as a hash, and limited to a kind (Upload only, or Manage photos). A script or another program sends one in an `Authorization: Bearer` header in place of logging in. No token can change the site's settings, reach a backup, or manage tokens. Adds the `api_tokens` table (migration 0004, applied by itself).
- Picture quality: Settings has a choice of Smaller files, Standard, or High for the copies shown on the site; changing it makes every photo's copies again.
- Icon and logo: an admin page to upload a site icon (browser tab, bookmarks, phone home screen) and a logo shown in place of the site's name, with a separate logo for dark mode and an adjustable height. Uploads are checked by content, redrawn, and kept in the database. Fotobogen's own mark now appears only in the admin.
- The admin has a menu down the side, grouped (Photos, Appearance, Site, Server), in place of a row of buttons on the dashboard; on a phone it folds behind a Menu button. The dashboard is now Overview: the site, the Fotobogen and Node.js versions, what is stored, and free space.
- Save buttons stay in view at the foot of the window on the long admin pages.
- Two more documentation pages: Configuration (every value in `fotobogen.config.js` and `.env.sample`, what it does, and whether to change it) and Customization (everything that can be made your own, where it is set, and how). A test fails if a setting is added without being documented.
- Documentation pages at fotobogen.com/docs: installation (macOS, Windows, Linux, Docker on a fresh VPS, Docker on a Laravel Forge server, with minimum and recommended server sizes), using Fotobogen, skins, modules, and questions (backups, restoring, and ways to start over). Their source is `docs/site/`.
- Windows: CI installs, builds, and tests on Windows, including a PowerShell smoke test (`scripts/smoke-test.ps1`).

### Changed

- The default port is 5150 (was 3000) in the app, the Docker image, both compose files, the Caddy and nginx configurations, and the pm2 file.
- `.env.example` is now `.env.sample`.
- The Docker image and the pm2 file start the app through the launcher.

### Fixed

- Docker: `SITE_URL` and `WEBHOOKS_ALLOW_PRIVATE` set in `.env` were not passed through to the app. The compose files now pass them, and `DEMO_MODE`.
- Changing a look while photos were still being made left those photos with the old look. They now get another pass.
- Skins set the text colour on the page body, so a light skin no longer inherits the admin's light text.
- Installing no longer compiles `better-sqlite3` from source. It failed on Windows without Visual Studio; the package's own prebuilt binaries are used on every platform.
