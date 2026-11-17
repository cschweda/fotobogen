# Changelog

All notable changes to Fotobogen are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/). What a version number
promises is set out in [docs/UPGRADING.md](docs/UPGRADING.md).

The same notes are published at
[fotobogen.com/docs/changelog](https://fotobogen.com/docs/changelog/), which
is built from this file.

## [Unreleased]

Nothing yet.

## [1.5.0] - 2026-11-16

### Added

- **The admin at its own address.** Set `ADMIN_HOST=admin.photos.example.com` (with `SITE_URL`) and the admin, the login, and their API answer only at that name, and the public pages only at the site's. A browser keeps the login for the admin's name and never sends it to the public one, so a script on a public page, such as a counting service's, can neither read from the admin nor send to it. This closes the limit described under visitor statistics in 1.4.0. It is optional; without it everything works as before. The README and the installation page have the four steps: DNS, `.env`, the web server, the certificate.
- A test in a real browser: the owner logged in at the admin's address, a hostile script on a public page next door, trying five ways to reach the admin. All five fail.

### Security

- The admin, the login, and setup can no longer be shown inside a frame, not even by one of the site's own pages.
- When the owner logs in, pages of the site open in other tabs that carry a counting script load themselves again, without it. This covers a tab left open; it is not proof against a script written to get round it, which is what `ADMIN_HOST` is for.

### Changed

- Any name ending in `.localhost` counts as this computer, as browsers treat it, so logging in over plain http works at such a name.
- "View your site" in the admin leads to the site's own address when the admin has another.

### Upgrading from 1.4.0

**Admin, System, Update to version 1.5.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`; to use `ADMIN_HOST` with Docker, also fetch the new `docker-compose.yml` (`git pull`), which passes the setting on. Nothing changes unless you set `ADMIN_HOST`.

## [1.4.0] - 2026-11-16

### Added

- **Visitor statistics.** A new page in the admin lets the owner count visits with a service of their choice: Plausible, Google Analytics, or any service installed with one script tag (Umami, Fathom, GoatCounter, Simple Analytics, Cloudflare Web Analytics, and others). It is off until chosen; a site that does not use it still loads nothing from anywhere else.
- The owner gives a script address, a measurement ID, or `data-` attributes, and Fotobogen writes the script tag. No code is typed into the admin, and there is deliberately no box for pasting script: that would let anyone who got the password put code in every visitor's browser.
- The script is on public pages only: never on the admin, the login, or setup, and never while the owner is logged in, so their own visits are not counted.
- A page with the script may report to that one service. Everything else stays blocked.
- Only the logged-in owner can change it. API tokens and demo visitors cannot.
- Said plainly where the service is chosen: its script runs on your site's own address, so you are trusting the service with your site as well as your visitors. Fotobogen keeps it off the admin and off pages you open while logged in; it cannot fence it off entirely.

### Upgrading from 1.3.3

**Admin, System, Update to version 1.4.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. Nothing changes for your visitors unless you choose a service under **Admin, Visitor statistics**.

## [1.3.3] - 2026-11-16

The documentation was read against the code, line by line, looking for anything it promised that the code did not do. This release fixes what that found: five faults in the code, and the places where the documentation said more than was true.

### Security

The first security audit was run against this version before release: four attackers, each with a running copy and the source. It made 36 findings, none critical; 20 are fixed here, and every one is listed, with what was done, in the [security audits](https://fotobogen.com/docs/security-audits/) record and the README. The fixes:

- **A backup uploaded through the admin is restored without its modules.** A module is code, and a backup carrying one ran it on the server at the next start, so a stolen admin password was enough to run code there. Modules are now restored only on the server itself, with `pnpm fotobogen restore` or a file left in the data folder.
- A WebP file's declared size is checked from its first bytes, before anything is decoded. A few tiny files claiming a huge size could take about 1 GB of memory while being refused.
- Previews, and reading an upload's size, are done one at a time.
- A skin or module file that is a link to a file elsewhere on the server is not read. A crafted skin could publish the login secret to visitors.
- The database, the copies made before updates, backups written from the command line, and a new `.env` can be read only by the user running Fotobogen. If you have an `.env` already, run `chmod 600 .env`.
- The check that a change comes from the site's own pages requires https when the site is reached over https, and a token header no longer stands in for it outside the admin API.
- Percent-encoded spellings of the admin, API, setup, and login addresses are refused, as are a malformed Host header and methods no website needs.
- A login ends 90 days after it was made. A restore ends every earlier login.
- What the admin and the login answer is never stored by a browser or proxy.
- Characters that XML forbids are kept out of the feed; one put in a title made the feed unreadable.
- One more range of private addresses is refused for webhooks.
- The nginx examples send the header that keeps browsers on https. Add it to a site already running: see the installation page.
- The `latest` Docker tag can no longer move back to an older release.
- Not fixed, and said plainly: an update trusts the repository it was cloned from, without checking a signature; hiding a photo does not withdraw picture addresses someone already has; a restore has no size limit.

### Fixed

- **`pnpm fotobogen backup`, `restore`, and `reset-admin` ignored `DATA_DIR` set in `.env`.** With the data folder moved that way, backup and reset-admin found no database, and restore put the backup into `./data` and reported success while the running site was untouched. The command-line tool now reads `.env`, as the server does.
- **A backup left in the data folder as `restore-pending.zip` was not checked for having been made by a newer version**, though one uploaded in the admin or restored from the command line was. It is now refused and set aside, and the site starts as it was.
- **An older version started on a database that a newer version had changed**, with no warning. It now refuses, says why, and changes nothing.
- **Photos served by Fotobogen itself did not carry the header that lets a script on another site read them** (`Access-Control-Allow-Origin`), though the documentation said so; only the nginx and Caddy files that come with it added it. A script on another site could not read a picture from a site run with `pnpm start` or behind a plain nginx proxy.
- **A photo that could not be processed could only be tried again from the Upload page, before leaving it.** Its page in the library now gives the reason and a **Try again** button, and `GET /api/admin/photos/<id>` gives the reason as `error`.

### Changed

- Documentation: Fotobogen contacts another server for sample photos, for the update check and an update, and for webhooks, all only when asked. It no longer calls the sample photos "the only outside request".
- Documentation: A failed update usually leaves the site as it was, but not always: if rebuilding the old version fails too, the site must be built by hand before a restart.
- Documentation: Two copies sharing a data folder is refused only when `pnpm start` can see the other copy; it cannot see one run by another user or in another Docker container.
- Documentation: Under pm2 the port is always set, so a second site needs its own `PORT` and its own name; and `DATA_DIR`, `HOST`, and `TRUST_PROXY` in `.env` are overridden by `ecosystem.config.cjs`.
- Documentation: A picture's address keeps working for anyone who has it after the photo is hidden, until the photo is deleted or rendered again.
- Documentation: Choosing a skin that has a look replaces a look you set yourself, unless its box is unticked.
- Documentation: With "show where photos were taken" on, the download is the file as uploaded: no watermark, and all its camera data.
- Documentation: A backup bigger than the upload limit cannot be restored through the admin; the Docker commands for backup and restore are given.
- Documentation: `pnpm dev` is on port 3000; `NO_COLOR` and `FOTOBOGEN_NO_QUESTIONS` are given when starting, not in `.env`; Docker passes on only some settings; `.env.sample` lists `HOST`, `TRUST_PROXY`, and `FOTOBOGEN_SKIP_PREFLIGHT`.
- Documentation: API, webhooks, modules, and skins: the header's reach, error bodies, what a malformed token answers, which events sample photos send, when a webhook's `image` is null, the order a look's steps run in, and error messages missing from the guides.
- The website's front page no longer listed the Docker image as planned, or version 1.1.0 in its description.

### Upgrading from 1.3.2

**Admin, System, Update to version 1.3.3**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. Then two things by hand, if they apply: `chmod 600 .env`, and on nginx add the `Strict-Transport-Security` line from the installation page. Everyone is asked to log in again 90 days after their last login. From this version on, going back to an older version needs the backup made before updating: the older version will refuse the database, where before it would have started on it.

## [1.3.2] - 2026-11-16

### Fixed

- After **Check for updates** found a newer version, the System page said so but did not offer to install it until the page was reloaded. The offer now appears at once.

### Upgrading from 1.3.1

**Admin, System, Update to version 1.3.2** (reload the page if the button is not there after checking), or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`.

## [1.3.1] - 2026-11-16

### Fixed

- **A site that had updated itself from the admin once could not do it again from there.** The System page went on showing "Updated to version X" for the last update and hid the button for the next one. The note and the check still worked, and so did `pnpm fotobogen update`. Found by updating a real 1.2.0 site to 1.3.0.
- Answering yes to **Hear about new versions?** (or ticking **Check once a day**) now always checks at that moment. If the site had checked within the day, it could answer "This is the latest version" from what it knew then.

### Upgrading from 1.1.0, 1.2.0, or 1.3.0

A site that has never updated itself from the admin: **Admin, System, Update to version 1.3.1**, as usual. A site that has, and so shows no button: run `pnpm fotobogen update` in Fotobogen's folder on the server, then restart it. From 1.3.1 on the button is back. Docker is not affected: `docker compose pull`, then `docker compose up -d`.

## [1.3.0] - 2026-11-16

### Added

- **Questions at the first start.** The first time `pnpm start` is run in a terminal, after the machine has been checked, it asks for the port, the site's address, and whether to switch demo mode on, and saves the answers to `.env`. Enter accepts what is suggested. It asks once, and never when nobody is at the keyboard (pm2, Docker, a script), so a server does not wait for an answer.
- `pnpm fotobogen init` asks the same questions again and keeps the rest of `.env`.
- Documentation: what to change in nginx on a droplet that already runs it, in the README and on the installation page.
- The preflight check says whether pm2 is installed. It is never a warning: pm2 is only needed to keep a site running on a server.
- **Colour in the terminal**: green for what is good, yellow for warnings, red for what stops the start, in the preflight check, the questions, and the start-up messages. The words `ok`, `WARN`, and `FAIL` are still printed. Colour is left out of log files and anything that is not a terminal, and `NO_COLOR=1` switches it off.

### Changed

- **The pm2 file follows `.env`.** `ecosystem.config.cjs` takes the port from `PORT` in `.env` (5150 if it is not set) instead of fixing it at 5150, so there is nothing to edit in it and a port answered at the first start is the one pm2 runs on. If you changed the port in that file by hand, put it in `.env` instead.

### Fixed

- After an update finished building, the System page went on saying "The update has started."

### Upgrading from 1.2.0

A copy installed with git: the note in the admin, or **Admin, System, Update to version 1.3.0**. Docker: `docker compose pull`, then `docker compose up -d`. If you edited `ecosystem.config.cjs` (to change the port, say), the update from the admin will stop and say that file is in the way: move the port to `PORT` in `.env`, run `git checkout ecosystem.config.cjs`, and update again.

## [1.2.0] - 2026-11-16

### Added

- **A note in the admin when a new version is out.** Every admin page says **Version X is available**, with a link to the System page. Nothing is installed by itself. **Close** puts the note away for the rest of the session; it comes back at the next login for as long as there is a newer version.
- **The admin asks, once, whether it may check for new versions.** **Hear about new versions?** appears the first time the admin is opened. A yes checks straight away and then at most once a day; a no is remembered. Fotobogen still makes no outside request you have not agreed to. A site that already had **Check once a day** ticked is not asked.
- **[Updating](https://fotobogen.com/docs/updating/)**, a documentation page on updating an existing installation: hearing about a version, updating from the admin, by hand, with Docker, checking it worked, and going back.

### Fixed

- The System page told a Docker install to update with `git pull` and `docker compose up -d --build`. With the published image that does not fetch the new version. It now says `docker compose pull`, then `docker compose up -d`.

### Changed

- The Docker instructions download the published image (`ghcr.io/cschweda/fotobogen`) instead of building one on the server, now that releases are tagged and their images published.
- Every release is now tagged, and has a release on GitHub with these notes and an image for Intel and ARM machines. This is what the update check in the admin looks for.

### Upgrading from 1.1.0

A copy installed with git: **Admin, System, Check for updates**, then **Update to version 1.2.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. Nothing in your data needs changing.

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
- **Demo mode** (`DEMO_MODE=1`): a `demo` / `demo` login that can look round the admin (tokens, webhooks, and backups stay closed to it) and change nothing.
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
[1.5.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.5.0
[1.4.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.4.0
[1.3.3]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.3
[1.3.2]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.2
[1.3.1]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.1
[1.3.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.0
[1.2.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.2.0
[1.1.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.1.0
[1.0.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.0.0
