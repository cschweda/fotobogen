# Roadmap

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

Visit counting is left to Plausible, which already tracks fotobogen.com. The page sends named events (`GitHub click`, `Author click`, `Theme switch`, `Section viewed`, `Screenshot viewed`) that can be added as goals there.

## For developers

| # | Feature | Status |
|---|---|---|
| 1 | Skins, with a guide ([SKINS.md](SKINS.md)) | Done |
| 2 | More module hook types: metadata extractors, export targets, page blocks | Planned |
| 3 | A module scaffold and a way to test a module from the command line | Planned |
| 4 | A read-only JSON API for public photos ([API.md](API.md)) | Done |
| 5 | Webhooks on upload and publish ([WEBHOOKS.md](WEBHOOKS.md)) | Done |
| 6 | An S3-compatible storage adapter | Planned |
| 7 | An import command for a folder of photos; importers for Flickr and WordPress exports | Planned |
| 8 | A documented upgrade and migration policy ([UPGRADING.md](UPGRADING.md)) | Done |

## Already built

Foundation, setup wizard and login, uploads and processing, sample photos, modules (film frame and film looks), the configuration file, the preflight check, and the health check. See [CHANGELOG.md](../CHANGELOG.md).
