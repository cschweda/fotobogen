# Upgrading, and what a version number promises

## Contents

- [Before any upgrade](#before-any-upgrade)
- [How to upgrade](#how-to-upgrade)
- [Version numbers](#version-numbers)
- [What counts as a breaking change](#what-counts-as-a-breaking-change)
- [The database](#the-database)
- [Going back](#going-back)
- [For contributors](#for-contributors)

## Before any upgrade

Download a backup: **Admin, System, Download a backup**, or `pnpm fotobogen backup`. Keep it until you have seen the new version working.

## How to upgrade

| Install | Command |
|---|---|
| Source, from the admin (1.1.0 and later) | **Admin, System, Update to version X**, or `pnpm fotobogen update` |
| Docker | `docker compose pull && docker compose up -d` |
| Docker on Forge | the deploy script (`deploy/forge-deploy.sh`) |
| Source, with pm2 | `scripts/rebuild.sh` |
| Source, by hand | `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, then restart |

Updating from the admin saves a copy of the database first, and puts the old version back if the new one will not install or build; the [README](../README.md#updating-from-the-admin) says exactly what it does. It arrived in version 1.1.0; a site on 1.0.0 is brought to 1.1.0 with one of the others.

Nothing else is needed. When the new version starts it brings the database up to date by itself, and prints what it did.

The admin tells you when a newer version exists, if you have said it may check: a note on every admin page, and **Admin, System, Check for updates**. [fotobogen.com/docs/updating](https://fotobogen.com/docs/updating/) walks through each kind of install.

## Version numbers

Fotobogen uses [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **PATCH** (1.4.0 to 1.4.1): fixes only. Always safe.
- **MINOR** (1.4 to 1.5): new features. Everything you have keeps working.
- **MAJOR** (1 to 2): something from the list below changed. The release notes say what and what to do about it.

These promises apply from version 1.0.0, the first release. Every release is described in [CHANGELOG.md](../CHANGELOG.md) and at [fotobogen.com/docs/changelog](https://fotobogen.com/docs/changelog/); a breaking change is always listed there with what to do about it.

## What counts as a breaking change

These are what a site owner, a skin author, a module author, or a script relies on. A release that changes one of them in a way that needs action is a breaking change:

1. **Your data.** The contents of the data directory. An upgrade never loses photos, titles, albums, or settings.
2. **The public API** ([API.md](API.md)): a field removed or changed in meaning. Adding fields is not breaking.
3. **Public addresses:** `/photo/<slug>`, `/album/<slug>`, `/tag/<slug>`, `/media/…`, `/feed.xml`.
4. **The skin contract** ([SKINS.md](SKINS.md)): a documented class name removed or the markup's structure changed.
5. **The module contract** ([MODULES.md](MODULES.md)): what `apply` receives, or a parameter type removed.
6. **Settings:** an environment variable or a key in the "okay to change" part of `fotobogen.config.js` renamed or removed.
7. **Commands:** a `pnpm fotobogen` command renamed or removed.
8. **The backup format.** A newer version always restores an older backup.
9. **Requirements:** a newer Node, more memory, a platform dropped.

Not covered: the admin's own endpoints under `/api/admin/`, the look of the admin, and anything in the "do not touch" part of the config file.

## The database

The database's shape changes through numbered migration files in `server/db/migrations/`. Each is applied once, in order, inside a transaction, when the server starts; a migration that fails leaves the database as it was and the server stops with the reason.

Migrations only move forward. There are no "down" migrations.

## Going back

Because migrations only move forward, an older version cannot open a database a newer one has changed. To go back to an earlier version, restore the backup you made before upgrading:

```bash
# with the old version installed and Fotobogen stopped
pnpm fotobogen restore fotobogen-backup-2026-11-15.zip
```

A backup made by a newer version is refused by an older one, with a message saying so, rather than half-restored.

## For contributors

- Never edit a migration that has been released; add a new one (`pnpm db:generate --name what_it_does`).
- A change to anything in the list above needs a line in `CHANGELOG.md` under **Changed** or **Removed**, and, if it needs action from someone, a major version.
- New API fields, skin classes, module parameter types, and settings are additions: note them under **Added**.
- Releases are tagged on `main` (`v1.2.3`); the tag publishes the Docker image.
- To make a release: move what is under **Unreleased** in `CHANGELOG.md` to a new heading `## [1.2.3] - YYYY-MM-DD`, set the same number in `package.json`, and run `node docs/site/build.mjs`, which rebuilds the Releases page of the website from the changelog. A test fails if the three disagree.
