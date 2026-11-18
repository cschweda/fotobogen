# Roadmap

**Version 1.11.0 is the current release** (18 November 2026), following 1.10.0, 1.9.0, 1.8.0, 1.7.0, 1.6.0, 1.5.0, 1.4.0, 1.3.3, 1.3.2, 1.3.1, 1.3.0, 1.2.0, 1.1.0 and 1.0.0, the first: see [CHANGELOG.md](../CHANGELOG.md). Everything marked Done below is in it. What is marked Planned or Later comes after.

The feature list agreed on 2026-11-15, in the order it is being built. Each item lands as one pull request against `staging`.

## For the site's owner and visitors

| # | Feature | Status |
|---|---|---|
| 1 | Public gallery and photo page | Done |
| 2 | Full library: edit title, caption, and alt text; reorder, hide, delete; bulk actions | Done |
| 3 | Albums and tags | Done |
| 4 | Backup and restore from the admin; export everything as a zip | Done |
| 5 | Scheduled publishing and drafts | Done |
| 6 | Slideshow (following openMantel) | Done |
| 7 | Download and licence settings per photo; a watermark module | Done |
| 8 | RSS, sitemap, and social cards per photo | Done |
| 9 | A notice in the admin when a new version exists | Done |

Visits to fotobogen.com itself are counted with Plausible. (Counting visits to your own site is a separate, optional feature of the software: Admin, Visitor statistics.) The page sends named events (`GitHub click`, `Author click`, `Docs click`, `Theme switch`, `Section viewed`, `Screenshot viewed`) that can be added as goals there.

## Added since, at the owner's request

| Feature | Status |
|---|---|
| Three more skins (Papier, Plakat, Rangefinder Dreams), and a light and a dark mode for every skin | Done |
| A skin can set a look for every photo | Done |
| A sharpening control on every bundled module | Done |
| Site text: every word on the public site can be changed in the admin | Done |
| Search and sharing: descriptions, titles, the sharing picture, and search-engine settings | Done |
| Links to a photo and to each size of its picture, to copy from the admin | Done |
| Documentation at [fotobogen.com/docs](https://fotobogen.com/docs/) | Done |
| Cropping a photo in the admin | Later |
| An admin menu down the side, and an Overview page | Done |
| A site icon and a logo, uploaded in the admin | Done |
| API tokens for uploading from a script or another program | Done |
| A slideshow that other sites can show in their own pages | Done |
| A trash: deleted photos are kept for 30 days and can be restored | Done |
| Pages of words (About, Contact) and the owner's own links in the menu | Done |
| Search on the public site | Done |
| Private albums, shown only at a link that cannot be guessed | Done |
| Albums to choose from on the front page, and a shuffled front page | Done |
| Optional visitor statistics, with a service the owner chooses | Done, in 1.4.0 |
| The admin at an address of its own (`ADMIN_HOST`) | Done, in 1.5.0 |
| A slideshow other sites can embed | Done, in 1.6.0 |
| A one-line installer, `npx fotobogen@latest` | Done |
| Optional two-step login with an authenticator app and backup codes | Done, in 1.9.0 |
| A picture-quality setting for the web copies | Done |
| Demo mode: a read-only login for a site that shows Fotobogen off | Done |
| HEIC, the format an iPhone saves in | Done, in 1.11.0 |
| Titles, captions, keywords and alt text read from inside a photo; alt text for every photo | Done, in 1.11.0 |
| Swiping between photos on a phone | Done, in 1.11.0 |
| Update from the admin, for a copy installed with git | Done, in 1.1.0 |
| A note in the admin when a new version is out, after asking once whether it may check | Done, in 1.2.0 |
| Questions at the first start (port, address, demo mode), `fotobogen init`, colour in the terminal | Done, in 1.3.0 |

## For developers

| # | Feature | Status |
|---|---|---|
| 1 | Skins, with a guide ([SKINS.md](SKINS.md)) | Done |
| 2 | More module hook types: metadata extractors, export targets, page blocks | Planned |
| 3 | A module scaffold and a way to test a module from the command line ([MODULES.md](MODULES.md#starting-and-testing-a-module-from-the-command-line)) | Done |
| 4 | A read-only JSON API for public photos ([API.md](API.md)) | Done |
| 5 | Webhooks on upload, publish, and delete ([WEBHOOKS.md](WEBHOOKS.md)) | Done |
| 6 | An S3-compatible storage adapter | Planned |
| 7 | An import command for a folder of photos (`fotobogen import`, done in 1.11.0); importers for Flickr and WordPress exports (planned) | Partly done |
| 8 | A documented upgrade and migration policy ([UPGRADING.md](UPGRADING.md)) | Done |

## Already built

Foundation, setup wizard and login, uploads and processing, sample photos, modules (film frame and film looks), the configuration file, the preflight check, and the health check. See [CHANGELOG.md](../CHANGELOG.md).
