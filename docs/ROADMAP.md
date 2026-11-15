# Roadmap

The feature list agreed on 2026-11-15, in the order it is being built. Each item lands as one pull request against `staging`.

## For the site's owner and visitors

| # | Feature | Status |
|---|---|---|
| 1 | Public gallery and photo page | Done |
| 2 | Full library: edit title, caption, and alt text; reorder, hide, delete; bulk actions | Done |
| 3 | Albums and tags | Next |
| 4 | Backup and restore from the admin; export everything as a zip | Planned |
| 5 | Scheduled publishing and drafts | Planned |
| 6 | Slideshow (following openMantel) | Planned |
| 7 | Download and licence settings per photo; a watermark module | Planned |
| 8 | RSS, sitemap, and social cards per photo | Done |
| 9 | A notice in the admin when a new version exists | Planned |

Visit counting is left to Plausible, which already tracks fotobogen.com; the placeholder site gets named goals instead.

## For developers

| # | Feature | Status |
|---|---|---|
| 1 | Skins, with a guide ([SKINS.md](SKINS.md)) | Done |
| 2 | More module hook types: metadata extractors, export targets, page blocks | Planned |
| 3 | A module scaffold and a way to test a module from the command line | Planned |
| 4 | A read-only JSON API for public photos | Started: `/api/photos` and `/api/photos/<slug>` exist; documentation to come |
| 5 | Webhooks on upload and publish | Planned |
| 6 | An S3-compatible storage adapter | Planned |
| 7 | An import command for a folder of photos; importers for Flickr and WordPress exports | Planned |
| 8 | A documented upgrade and migration policy | Planned |

## Already built

Foundation, setup wizard and login, uploads and processing, sample photos, modules (film frame and film looks), the configuration file, the preflight check, and the health check. See [CHANGELOG.md](../CHANGELOG.md).
