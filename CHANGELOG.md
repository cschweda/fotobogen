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
- Two more skins: Papier (light) and Plakat (dark, poster style), with a guide to making a skin from one of them.
- Windows: CI installs, builds, and tests on Windows, including a PowerShell smoke test (`scripts/smoke-test.ps1`).

### Changed

- The default port is 5150 (was 3000) in the app, the Docker image, both compose files, the Caddy and nginx configurations, and the pm2 file.
- `.env.example` is now `.env.sample`.
- The Docker image and the pm2 file start the app through the launcher.

### Fixed

- Skins set the text colour on the page body, so a light skin no longer inherits the admin's light text.
- Installing no longer compiles `better-sqlite3` from source. It failed on Windows without Visual Studio; the package's own prebuilt binaries are used on every platform.
