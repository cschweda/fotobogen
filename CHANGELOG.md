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
