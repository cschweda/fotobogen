# Changelog

All notable changes to Fotobogen are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/). What a version number
promises is set out in [docs/UPGRADING.md](docs/UPGRADING.md).

The same notes are published at
[fotobogen.com/docs/changelog](https://fotobogen.com/docs/changelog/), which
is built from this file.

## [Unreleased]

- `publish.sh`, which releases the installer to npm and is of use only to Fotobogen's maintainer, moved from the top of the folder to `installer/publish.sh`, beside the installer it publishes. A site's own folder now begins with only what its owner uses.
- The photo page and slideshow screenshots show a photo's date, camera, lens and settings. The values are examples, and the README says so: the sample photos carry no camera data.
- The light and dark mode button lines up with the menu links beside it, in all four bundled skins. A skin of your own can do the same with `align-items: center` on `.fb-nav`.

## [1.11.0] - 2026-11-18

An iPhone's photos, the words saved inside a file, alt text for every photo, a folder at once, and a swipe on a phone. It follows a review of the whole program by someone who had never seen it, which found ten defects, all fixed here.

### Added

- **HEIC, the format an iPhone saves in, is accepted.** The file is kept exactly as it came. A JPEG is made from it once, when it arrives, and the web copies are made from that. Up to 25 megapixels: an iPhone's usual 12 or 24 fit, its 48-megapixel setting does not.
- **A photo arrives with its words.** The title, caption, keywords and alt text that Lightroom, Capture One, Apple Photos and others save inside a file become the photo's title, description, tags and alt text. The upload page says what it read. Switch it off under **Settings, New uploads** if your files carry notes not meant for visitors.
- **Every photo has alt text.** One that arrives with none is given a start, from its title, its file's name, or the day it was taken, and is flagged **Alt text to check** in the Library until you rewrite it or say it is right. Alt text can be changed but not emptied. Photos you already have are given a start the same way the first time this version starts.
- **`pnpm fotobogen import <folder>`** brings in a whole folder, with `--albums` to make an album of each folder inside it, or `--album <name>` to put everything in one. It skips what is already there, so it can be run again.
- **Swiping.** On a phone, a swipe across a photo goes to the next or the one before: on the photo's page, in the photo opened over the grid, and in the slideshow.
- The RSS feed carries each photo's alt text.
- The upload answer from the admin API lists what was read from the file (`fromFile`); `GET /api/admin/photos?show=alt-to-check` lists photos whose alt text is still to be checked.

### Fixed

- **A photo set to "Scheduled" with no date was published at once.** It is now refused, with the date field marked.
- **On a phone the grid showed three or four columns of tiny pictures.** It shows two, in all four skins.
- **On a phone the slideshow's details lay over its buttons.** They rest on top of them now, however many rows the buttons take.
- **Choosing a skin that brings a look, then leaving it, lost a look you had set for all photos.** Yours is set aside and comes back, and the Skins page says so before you save.
- **Three pages ran off the side of a phone:** setup step 4, Albums with a private album, and API tokens.
- **Leaving a photo's page with changes not yet saved** now asks first.
- **The arrow keys stopped working in a photo opened over the grid** once the link that had focus was gone.
- **The question about hearing of new versions lay over the page's own controls** on a wide screen. It is part of the page now.
- **Every page that does not exist wrote an error to the server's log.** It writes nothing.
- **A new page of words was public the moment it was added, still empty.** It is hidden until you first save it.
- The Albums page now says how to put photos in an album. The upload page links each finished photo to its edit page.

### Changed

- For skin writers: the slideshow's details and controls now sit inside one new block, `fb-slideshow__foot`. A skin written for an earlier version goes on working as it did; copy three rules from Swiss to get the phone layout right ([writing a skin](https://fotobogen.com/docs/writing-a-skin/)).
- The Library's filter "Without alt text" is now "Alt text to check", since no photo is without.
- Documentation corrected where a review found it wrong or out of date, the README's account of how the app is kept private behind a proxy in Docker above all.

### Security

The sixth [security audit](https://fotobogen.com/docs/security-audits/), of everything new here, before release: 8 findings, 1 high, 2 medium, 3 low, 2 informational. Six fixed, one reduced, one accepted.

- **A file built for the purpose could stop the site while its words were read** (high). They are read in a thread of its own, with five seconds to do it.
- **A HEIC could use far more memory than a small server has** (medium). It is decoded in a separate process, one at a time, and the limit is 25 megapixels.
- **`fotobogen import` gave its pass to whatever program answered at the site's address** (medium). It now makes the site prove itself first, and the pass is narrower and expires.
- Alt text of invisible characters is refused; such characters are removed from words read out of files. The import no longer follows hard links, and removes only its own pass.

### Updating

**Admin, System, Update to version 1.11.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. The database gains one column, by itself, at the first start; make a backup first, as before any update.

## [1.10.0] - 2026-11-17

The slideshow's details say more, and the screenshots are new.

### Added

- **The slideshow's details list what the photo's page lists.** Press a photo in the slideshow and, with its title and description, you now see its size in pixels, the albums it is in, its tags, and its licence, as well as the date taken, camera, lens, and exposure it already gave. Albums and tags are links. Size follows the camera-details setting, as on the photo's page. Where a photo was taken is still never shown in the slideshow, and an album visitors may not see is never named.
- `GET /api/slideshow` gives each slide `size`, `tags`, `albums`, and `licence`. Nothing is removed.

### Changed

- For skin writers: the details panel may now hold several paragraphs of the class `fb-slideshow__facts`, and the photo page's `fb-tags` list. A skin written for an earlier version shows them without changes; the four built-in skins tidy the spacing of the tags there.
- The screenshots in the README and on fotobogen.com are retaken from this version, except the admin overview, the grid and the photo page, which had not changed since 1.9.0.

### Security

- The fifth [security audit](https://fotobogen.com/docs/security-audits/), of this change: no findings.

### Updating

**Admin, System, Update to version 1.10.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. Nothing in the database changes.

## [1.9.0] - 2026-11-17

Optional two-step login, and the fourth [security audit](https://fotobogen.com/docs/security-audits/). Updating changes nothing about how you log in until you switch it on.

### Added

- **Two-step login**, as an option under **Admin, Two-step login**. Switched on, logging in takes your password and then a six-digit code from an authenticator app such as Google Authenticator. Nothing is sent by text message or email. It is off until you switch it on, and updating changes nothing about how you log in.
- **Ten backup codes**, given when you switch it on, each good for one login when the phone is not to hand. The page shows them again whenever you ask, marks the used ones, lets you download them, and makes ten new ones on request.
- **One entry in the authenticator app for a whole server.** The key is kept once for the account Fotobogen runs under, so a site you delete and install again, or a second site on the same server, uses the entry the app already has. The entry is named after the server. In Docker each site has its own key unless `TWO_STEP_KEY` is set.
- **`pnpm fotobogen two-step off`** switches it off from the server, for an owner who has lost both the phone and the backup codes; **`pnpm fotobogen two-step key`** shows the server's key, to add to a new phone.
- The key and the backup codes are shown only after the password is given again, and no API token can read or change them. Switching two-step login on signs out every other browser.

### Security

- The fourth [security audit](https://fotobogen.com/docs/security-audits/), of two-step login: 6 findings, 2 low and 4 informational; 2 fixed, 4 accepted. Wrong codes are counted for the account as well as for each address, so guessing from many addresses at once is stopped after ten. A backup file never holds the two-step key or the backup codes, and restoring a backup leaves two-step login as the site has it.

### Fixed

- A browser test of the sample photos that could fail on a slow Windows machine.

### Updating

**Admin, System, Update to version 1.9.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. The update adds to the database by itself. Two-step login stays off until you switch it on under **Admin, Two-step login**.

## [1.8.0] - 2026-11-17

Pages, search, private albums, a trash, albums to choose from on the front page, a one-line installer, and the third [security audit](https://fotobogen.com/docs/security-audits/). Updating changes nothing about how your site looks or behaves until you use the new things, with one exception: deleting a photo now moves it to the trash.

### Added

- **A trash.** Deleting a photo, in the library or on its own page, now moves it to the trash: it is off the site at once and kept for 30 days, with the file that was uploaded, then removed for good. Under **Admin, Library, Show, Trash** a photo can be restored, which puts it back as it was (same address, albums, tags, and place in the order), or deleted for good straight away, which asks first. The library says how many photos are in the trash, and each one there shows the day it will go.
- Uploading a file that is in the trash is refused, with a note saying where it is.
- **Pages.** A new page in the admin, **Pages**, for pages of words beside your photographs: About, Contact, anything. Each has an address of its own at the top of the site (`/about`) and, unless you take it out, a place in the menu. The text is plain text with a little marking (paragraphs, headings, lists, bold, italic, links), with a preview as you type; web and email addresses become links by themselves. It is never used as HTML, and a link goes only to a web address, an email address, or a page of the site. A page can be hidden while it is written. Up to 50.
- **Search.** Visitors can search your photographs: a Search link in the menu leads to a page with a search box. Every word typed must be found in a photo's title, description, alt text, tags, or the titles of its albums. Only what a visitor can already see is searched; a hidden photo, a photo in the trash, or the name of a hidden album is never found. It works with JavaScript switched off, and search engines are told not to list the results. Its words are under **Admin, Site text**. For other programs: `GET /api/search?q=`.
- **Albums on the front page.** Each album has a switch, **Offer it on the front page**. The albums switched on appear as a row of names over the photos on the front page; a visitor who chooses one sees that album alone, and All brings everything back. It works with JavaScript switched off. A new album is offered unless you switch it off; your existing albums are not, until you switch them on.
- **A shuffled front page.** Under **Admin, Settings**, the front page's photos can be shuffled, a new order for each visit, or kept in the order of your library. A new site starts shuffled. **A site you already have keeps the order of its library** until you change it. For other programs, `/api/photos` stays in the library's order and takes `order=random&seed=`.
- **Private albums.** An album can be made **Private** under **Admin, Albums**. It then has a link that cannot be guessed, to give to the people who may see it; they need no login. A private album is listed nowhere on the site and can hold hidden photos, which stay off the site: the way to share a client's or a family's photographs. **Make a new link** replaces the link at once and ends the old one. Search engines are told to keep away, the pages are never stored by browsers or proxies, and no counting script is put on them.
- **Sample albums.** When you choose the sample photos, they come in two sample albums, "Coast and mountains" and "Desk and table", so a new site shows how albums work, on the albums page and on the front page. Deleting an album never touches its photos, and removing the sample photos takes the sample albums with them unless you have put photos of your own into one.
- A one-line installer, `npx fotobogen@latest`, in [`installer/`](installer): it checks the tools, asks for a folder, fetches the newest release, installs, builds, and offers to start it. It is published to npm as `fotobogen`, with its own version numbers and changelog, by `./publish.sh`. The README and the installation guide now begin with it.
- **Links in your menu.** On the same page, up to eight links of your own, shown in the menu after your pages.
- For other programs: `GET /api/pages/<slug>` gives a page's title and text, and `/api/site` lists the menu under `menu`.
- For skins: a page is `<article class="fb-page">` with its text in `.fb-page-body`, and the menu may now hold more links. The search page is `.fb-search` with a form inside, and the row of albums on the front page is `.fb-chooser`. The four bundled skins are updated; a skin of your own should style `.fb-page-body` and `.fb-search__form`, and let `.fb-nav` wrap (docs/SKINS.md).

### Changed

- For programs using an API token: `DELETE /api/admin/photos/<id>` moves a photo to the trash; `?forever=1` deletes one that is in the trash for good; `POST /api/admin/photos/<id>/restore` takes it back out. In bulk actions, `delete` moves to the trash, and `restore` and `delete-forever` are new. A deleted photo answers `404` to `GET /api/admin/photos/<id>` and is left out of the list unless `?trash=1` is given.
- Webhooks: `photo.deleted` is sent when a photo goes to the trash, which is when it leaves the site. Restoring it sends `photo.published`.
- While a photo is in the trash, its picture files still exist: an address someone already has keeps working until the photo is deleted for good.

### Security

- **A third audit**, of everything new in this version: 11 findings, none above low; 4 fixed, 6 accepted, 1 open. The whole record is in the README and at [fotobogen.com/docs/security-audits](https://fotobogen.com/docs/security-audits/). No way was found to see a photo, page, or album a visitor may not see, to change anything without being the owner, or to make text an owner types run as script.
- A counting script can no longer come along into a private album from another page, where it would have told its service the album's link.
- A photo in the trash can no longer be changed through the admin's API.
- A page of text with no spaces in it is read quickly; before, it took a third of a second on every view.
- The installer treats a link that leads nowhere as a folder that is already there. This is in installer 1.0.1.

### Updating

**Admin, System, Update to version 1.8.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. The update adds to the database by itself. Your front page keeps the order of your library, your existing albums are not put on the front page, and nothing is private or hidden that was not before.

If you made a skin of your own, add styles for `.fb-page-body`, `.fb-search__form`, and `.fb-chooser`, and let `.fb-nav` wrap: see `docs/SKINS.md`, or copy the rules from a bundled skin.


## [1.7.0] - 2026-11-17

The second [security audit](https://fotobogen.com/docs/security-audits/), of the slideshow for other sites, and a round of fixes found by installing 1.6.0 on a Mac.

### Security

- **A second audit, of the slideshow for other sites.** Seven findings, none above low: three fixed, one reduced, three accepted, none open. The whole record is in the README and at [fotobogen.com/docs/security-audits](https://fotobogen.com/docs/security-audits/). No way was found to put any other page of a site in a frame, to steer the frame elsewhere, or to switch the slideshow without being the owner.
- The slideshow's address is now decided before any page is made. It must be spelled exactly, and an album or tag must be one a visitor may see. Anything else, a hidden album included, gets a bare "not available" that cannot be framed, where before some of these reached the site's own "not found" page.
- The slideshow's page is marked never to be stored by a browser or a proxy, so switching it off takes effect at once.
- New tests keep these in place, among them a real browser on a second site trying to steer the frame to the home page, the login, and the admin.

### Fixed

- **Full screen works.** The full-screen button over a photo and the one in the slideshow (and the F key there) did nothing: the browser refused, and its console said "Permissions policy violation: fullscreen is not allowed in this document". A header Fotobogen sends with every page forbade full screen outright. The site's own pages are now allowed it. Camera, microphone, location, and screen capture stay refused, and a page framed inside the site gets no full screen.
- **The photo that opens over the grid is centred, in a card that is the same for every photo.** It sat in the top-left corner of the window, and its size changed with each photo: short for a wide picture, tall for an upright one. It now sits in the middle of the window at one size, with the words in one column down its right side and the picture in the middle of the room that is left, whatever the picture's shape and however little there is to say about it. On a phone it is one column, as before. This is in all four skins. A skin of your own gets the centring without any change; for the fixed card, copy the block that begins `@media (min-width: 52.01rem)` from a bundled skin.
- **The date taken is the day the camera wrote.** The date is read from the photo's own metadata at upload, as before, but it was worked out on the server's clock: on a server not set to UTC, a photo taken in the evening could show the next day's date. It is now kept exactly as the camera wrote it. Photos already uploaded keep the date they have; correct one under **Admin, Library**, or upload it again.
- A photo whose camera data claimed a year below 100 had 1900 added to it. The date is kept as written.
- The tests stood in for the browser's part of full screen, which is why this was missed. A new test asks a real browser whether full screen is allowed, and another measures where the photo window sits.

### Changed

- When a file has no "date taken" but does say when it was made (a scan, some phone apps), that date is used. A file that says only when it was last edited, or nothing, leaves the date empty for you to fill in. The field in the admin now says where its date comes from.
- The README and the installation guide explain installing into a folder with another name and running several installs on one machine: what each needs of its own, and why a browser keeps only one login for `localhost`.

### Updating

**Admin, System, Update to version 1.7.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`.

## [1.6.0] - 2026-11-17

### Added

- **A slideshow for other sites.** A new page, **Admin, Embed on another site**, lets other sites show a slideshow of your public photos inside their own pages, and gives the one line of code to paste there. Choose every photo, one album, or one tag, and a size; the frame shrinks to fit a narrower page and keeps its shape. The slideshow has one bar of controls (first, back, play or pause, forward, last, and where it has got to) with "Powered by Fotobogen" at the end, linked to fotobogen.com. Pressing a photo opens its page on your site in a new tab. It is worked from the keyboard too: the arrow keys, Home, End, and Space.
- It is off until you switch it on. While it is off, its address (`/embed/slideshow`) answers "not found", and switching it off again stops it at once on every site that has the code.
- Two new pieces of site text, for the First and Last buttons, under **Admin, Site text**.

### Security

- Only the slideshow at `/embed/slideshow` may be shown in a frame by another site, and only while it is switched on. Every other page still refuses, the admin and the login refuse even the site's own pages, and so does anything else asked for under `/embed`.
- The embedded slideshow shows what a visitor can already see and nothing else: no hidden, draft, or scheduled photo, and never a location. It carries no login, loads no counting script whatever is set under Visitor statistics, and every link in it opens in a new tab, so no other page of the site is ever shown inside the frame.
- Only the logged-in owner can switch it on or off. No API token can, and a demo visitor cannot.

### Changed

- The site's own slideshow and the embedded one share one piece of code for playing. Nothing about the site's own slideshow changes.

### Updating

**Admin, System, Update to version 1.6.0**, or `pnpm fotobogen update`. Docker: `docker compose pull`, then `docker compose up -d`. Nothing changes for your site unless you switch the slideshow on under **Admin, Embed on another site**.

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
[1.11.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.11.0
[1.10.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.10.0
[1.9.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.9.0
[1.8.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.8.0
[1.7.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.7.0
[1.6.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.6.0
[1.5.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.5.0
[1.4.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.4.0
[1.3.3]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.3
[1.3.2]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.2
[1.3.1]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.1
[1.3.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.3.0
[1.2.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.2.0
[1.1.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.1.0
[1.0.0]: https://github.com/cschweda/fotobogen/releases/tag/v1.0.0
