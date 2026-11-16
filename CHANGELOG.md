# Changelog

All notable changes to Fotobogen are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/). What a version number
promises is set out in [docs/UPGRADING.md](docs/UPGRADING.md).

The same notes are published at
[fotobogen.com/docs/changelog](https://fotobogen.com/docs/changelog/), which
is built from this file.

## [Unreleased]

### Fixed

- The System page told a Docker install to update with `git pull` and `docker compose up -d --build`. With the published image that does not fetch the new version. It now says `docker compose pull`, then `docker compose up -d`.

### Changed

- The Docker instructions download the published image (`ghcr.io/cschweda/fotobogen`) instead of building one on the server, now that releases are tagged and their images published.

## [1.1.0] - 2026-11-15

### Added

- **Update from the admin.** When a newer release is found, the System page can install it on a copy made with git: it saves a copy of the database, fetches the release, installs and builds it, and restarts (under pm2) or waits for a restart. If any step fails, the old version is put back and built again. A Docker copy is shown the commands to run instead. Only the logged-in owner can update.
- `pnpm fotobogen update [version]` does the same from the command line.

### Upgrading from 1.0.0

Version 1.0.0 cannot update itself, so this one step is done by hand: `git pull`, `pnpm install`, `pnpm build`, and restart (or `scripts/rebuild.sh` under pm2; `git pull` and `docker compose up -d --build` with Docker). From 1.1.0 on, later releases can be installed from the admin. Nothing in your data needs changing.

## [1.0.0] - 2026-11-15

The first release. Fotobogen is a self-hosted publishing platform for
photographs: install it on a computer of your own, answer a few questions in
a browser, and get a public photo site with an admin behind a login.

Being the first release, this entry describes everything in it, by area.
Later entries list only what changed.

### Installing and running

- Runs on **Node.js 24**, or in **Docker**, on Linux (Ubuntu and Debian), macOS, and Windows. Nothing is compiled during installation.
- `pnpm install`, `pnpm build`, `pnpm start`. A Node.js or pnpm that is too old stops the first command, before anything is fetched, and says what to do.
- A **preflight check** before every start: Node.js version, operating system, processor, memory, disk space, the data folder, and the image and database libraries. A failure stops the start and says what to fix. Also `pnpm preflight`.
- Default port **5150**. If it is busy, the next free port above it is used; a port you set yourself is used exactly. Two copies on one machine are detected, and never share a data folder.
- Everything a site owns is in one folder, `data`: the SQLite database, the photographs as uploaded, and the resized copies.
- **Settings** in one commented file, `fotobogen.config.js`, in an "okay to change" part and a "do not touch" part. `.env` and the environment override it, and a change to `.env` needs only a restart.
- A **Docker** image definition, a quick-start compose file with Caddy (HTTPS by itself), a compose file and nginx configuration for Laravel Forge, a pm2 process file, and an update script.
- `/api/health` for uptime monitors: version, database status, queue depth, and uptime.

### Setting up

- A one-time **setup token**, printed at every start until setup is done.
- A six-step **setup wizard** in the browser: token, site name, admin account, grid layout and photo view, and whether to start empty or with sample photos.
- **Sample photos**: 25 photographs from Lorem Picsum (Unsplash), downloaded only if asked for, with a progress counter; they can be removed in one step.
- A one-time notice that backups are the owner's responsibility and the software comes with no warranty.

### Photographs

- **Upload** JPEG, PNG, WebP, TIFF, and AVIF, judged by content, not by name. 50 MB and 100 megapixels each by default; duplicates are refused.
- **Processing** in the background, one photo at a time, to stay within a small server's memory: camera details read from the file, rotation, sRGB, and WebP copies at four sizes. Interrupted work resumes after a restart. The uploaded file is never changed.
- **The library**: reorder by dragging or from the keyboard; hide, show, or delete several at once; find hidden photos, photos with no alt text, and failures.
- **Each photo**: title, description, alt text, web address, date taken, albums, tags, licence, and whether it can be downloaded.
- **Scheduling and drafts**: public now, public from a date and time, or hidden. New uploads can start as drafts.
- **Albums and tags**, each with its own public page.
- **Links** to copy for each photo: the address of its page and of each size of the picture, and HTML to embed it.
- **Picture quality**: Smaller files, Standard, or High for the copies shown on the site.

### The public site

- A **photo grid**, masonry or square, laid out by CSS with no JavaScript needed, with blurred placeholders and no layout shift.
- A **page for each photo**, which can also open over the grid: title, description, camera details, size, licence, tags, albums, previous and next, and a full-screen view.
- A **slideshow** for the whole site, an album, or a tag, with keyboard control.
- **Light and dark** modes on every skin, with a switch for visitors.
- An **RSS feed**, a **sitemap**, `robots.txt`, and sharing cards for every page.
- Where a photo was taken is never shown unless the owner switches that on; the copies visitors see carry no camera data.
- Built and tested to **WCAG 2.1 level AA**.

### Making the site your own

- **Site text**: the site's name, tagline, language, and every fixed piece of text on the public pages can be put in the owner's own words. No public page says "Fotobogen".
- **Icon and logo**: a site icon, and a logo in place of the site's name, with a separate one for dark mode.
- **Search and sharing**: page titles, the site's description, the picture shown when the site is shared, whether search engines may list it, the site's proper address, and verification codes for Google and Bing.
- **Licence** for the site and for each photo: all rights reserved, or Creative Commons.

### Skins

- Four skins, each with a light and a dark mode: **Swiss**, **Papier**, **Plakat**, and **Rangefinder Dreams**.
- Options for each: accent colour, space between photos, and number of columns.
- A skin can set a **look for every photo**. Rangefinder Dreams shows every photo in black and white.
- A contrast check that warns when a colour would make text hard to read.
- Skins of your own go in `data/skins/`: a stylesheet and a settings file, with no build step.

### Modules

- Three modules, all switched off until switched on: **Film looks** (tone and grain of several kinds of film), **Film frame** (a contact-print border), and **Watermark**. Each has a sharpening control.
- A look can be set for all photos or for one, with a live preview.
- Modules of your own go in `data/modules/`: plain JavaScript, with no build step and no admin code. `pnpm fotobogen module new` starts one and `pnpm fotobogen module test` checks it.

### Keeping it safe

- One admin account. Passwords of at least 12 characters, hashed with scrypt. Five wrong attempts in 15 minutes lock an address out.
- **Backup and restore**: one zip of everything that cannot be made again, from the admin or the command line. What a restore replaces is kept, not deleted.
- **API tokens** for scripts and other programs: shown once, stored as a hash, and limited to uploading or to managing photos. No token can change settings or reach a backup.
- **Demo mode** (`DEMO_MODE=1`): a `demo` / `demo` login that can open every admin page and change nothing.
- **Update notice**: the admin can check GitHub for a newer release, on request or once a day.
- No outside requests unless asked for: sample photos, the update check, and webhooks.

### For developers

- A read-only **public JSON API**, readable from other sites.
- **Webhooks**: signed messages when a photo is uploaded, goes live, or is deleted.
- Guides to **writing a skin** and **writing a module**, each with worked examples that are tested.
- A documented upgrade policy: what a version number promises, and how to go back.

### Documentation

- [fotobogen.com/docs](https://fotobogen.com/docs/): installation on each system, configuration (every setting), using it, customization, skins, modules, the two developer guides, and questions.

### Known limits of this release

- When this was released no Docker image had been published, and the Docker instructions built the image on your own machine. The image for 1.0.0 was published the next day, when the release was tagged.
- **Not yet tried:** a Laravel Forge server, a real 1 GB server (a 1 GB memory limit was tested in Docker), Docker on Windows, and the Docker quick start with Caddy from end to end.
- One admin account only. No comments, no shop, no storage outside the server's own disk.

[Unreleased]: https://github.com/cschweda/fotobogen/commits/staging
[1.1.0]: https://github.com/cschweda/fotobogen/tree/main
[1.0.0]: https://github.com/cschweda/fotobogen/blob/main/CHANGELOG.md
