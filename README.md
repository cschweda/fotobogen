![Fotobogen: publish your photographs on a website of your own](site/og.png)

[![CI](https://github.com/cschweda/fotobogen/actions/workflows/ci.yml/badge.svg)](https://github.com/cschweda/fotobogen/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)

# Fotobogen

A self-hosted publishing platform for photographs: install it on a small
server, answer a few first-run questions, and get a public photo site with an
admin backend. Think "WordPress for photos".

**Status: early development.** What exists today is the foundation: the app
boots, creates its data directory, can be claimed once through a
token-protected setup wizard, and guards an admin area behind a login.
Uploading, the photo grid, skins, and modules are not built yet. The full
plan is in [docs/DESIGN.md](docs/DESIGN.md); changes are recorded in
[CHANGELOG.md](CHANGELOG.md).

## Contents

- [How it runs](#how-it-runs)
- [Local development](#local-development)
- [Running the built server](#running-the-built-server)
- [Tests](#tests)
- [Docker quick start](#docker-quick-start)
- [Laravel Forge](#laravel-forge)
- [Without Docker (pm2)](#without-docker-pm2)
- [Resetting the admin password](#resetting-the-admin-password)
- [The data directory](#the-data-directory)
- [Settings](#settings)
- [The fotobogen.com placeholder page](#the-fotobogencom-placeholder-page)
- [Licence](#licence)

## How it runs

Fotobogen is a server application, like WordPress. It runs on one machine
(a small Linux server, or your own Mac or PC for trying it out) and you use
it from any web browser. The setup wizard is a web page; there is nothing to
install on the computers you browse from.

The machine that hosts it needs **either** Docker **or** Node 24. Its
dependencies ship prebuilt for macOS, Windows, and Linux, so nothing should
need compiling; so far it has been run on macOS and on Linux in Docker, not
on Windows. There is no double-click desktop installer.

## Local development

Requirements: [Node 24](https://nodejs.org) and [pnpm](https://pnpm.io) 10.

```bash
nvm use            # reads .nvmrc (Node 24)
pnpm install
pnpm dev           # http://localhost:3000
```

On first start the terminal prints a setup token:

```
Fotobogen setup token: 3b213e46bd70894ad18f1357791b1f18
Open the site in a browser and enter this token to finish setup.
```

Open http://localhost:3000, enter the token, and complete the six steps. You
end up logged in at `/admin`. Everything the site stores goes in `./data`;
delete that directory to start over with a fresh install.

After changing `server/db/schema.ts`, generate a migration with
`pnpm db:generate`. Migrations are applied automatically when the server
starts.

## Running the built server

```bash
pnpm build
node .output/server/index.mjs
```

No environment variables are required. The server listens on port 3000
(`PORT` changes it) and keeps its data in `./data` (`DATA_DIR` changes it).
Restarting keeps you logged in and does not change the setup token.

## Tests

```bash
pnpm test                                # unit tests, then tests against the built server
pnpm exec playwright install chromium    # once
pnpm test:e2e                            # browser tests, including axe accessibility checks
```

Both commands build the app first. Set `FB_SKIP_BUILD=1` to reuse an
existing build while iterating.

## Docker quick start

For a server with nothing on it but Docker. This runs Fotobogen behind
[Caddy](https://caddyserver.com), which obtains an HTTPS certificate for your
domain automatically.

> No image has been published yet. Until the first release, uncomment the
> `build: .` line in `docker-compose.yml` to build the image locally.

```bash
git clone https://github.com/cschweda/fotobogen.git
cd fotobogen
mkdir -p data                # so the data directory belongs to you, not root
cp .env.example .env         # set DOMAIN; leave it unset to try it on http://localhost
docker compose up -d
docker compose logs app      # shows the setup token
```

If your user id is not 1000 (run `id -u`), set `PUID` and `PGID` in `.env`
so the files in `./data` belong to you.

Update with `docker compose pull && docker compose up -d`.

## Laravel Forge

For a Forge-provisioned server, where nginx already owns ports 80 and 443 and
Forge manages the certificate.

1. Install Docker on the server and add the `forge` user to the `docker` group.
2. Create the site in Forge and install this repository into it.
3. In the site directory: `mkdir -p data`, then
   `PUID=$(id -u) PGID=$(id -g) docker compose -f docker-compose.forge.yml up -d`.
4. Paste the blocks from [deploy/forge-nginx.conf](deploy/forge-nginx.conf)
   into the site's nginx configuration, adjusting the two marked paths.
5. Issue the certificate through Forge.
6. Use [deploy/forge-deploy.sh](deploy/forge-deploy.sh) as the deploy script.

The app listens on `127.0.0.1:3000` only (`PORT` in `.env` changes the port).

## Without Docker (pm2)

Needs Node 24, pnpm, and [pm2](https://pm2.keymetrics.io) on the server.
Building takes more memory than running; on a 1 GB server, add 2 GB of swap
first.

```bash
pnpm install --frozen-lockfile
pnpm build
pm2 start ecosystem.config.cjs
pm2 logs fotobogen           # shows the setup token
```

Put nginx in front of it with [deploy/forge-nginx.conf](deploy/forge-nginx.conf).
Update with `scripts/rebuild.sh`.

## Resetting the admin password

There is no password reset by email. On the server:

```bash
pnpm fotobogen reset-admin                                        # native
docker compose exec app node scripts/fotobogen.mjs reset-admin    # Docker
```

It asks for a new password (at least 12 characters) and signs out every
existing session. The app does not need to be stopped.

## The data directory

Everything a site owns lives in one directory. Backing up or moving a site
means copying it.

| Path | What it is |
|---|---|
| `fotobogen.db` | The SQLite database |
| `secret` | The key that seals login cookies. Keep it private; deleting it signs everyone out |
| `setup-token` | The one-time setup token. Exists only until setup is complete |
| `originals/`, `derivatives/` | Uploaded photos and their resized copies (later versions) |
| `skins/`, `modules/` | Skins and modules you install (later versions) |

## Settings

All optional.

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `./data` | Where the site keeps its data |
| `PORT` | `3000` | Port the server listens on |
| `HOST` | all interfaces | Address the server listens on |
| `TRUST_PROXY` | off | Set to `1` only when the app is reachable solely through your own reverse proxy. It makes the login limit use the visitor's address from `X-Forwarded-For`. The shipped Docker and pm2 files set it |

Login cookies are marked `Secure`, so logging in works over HTTPS, and over
plain HTTP only on `localhost`.

## The fotobogen.com placeholder page

`site/` holds the single page currently shown at fotobogen.com, and
`netlify.toml` tells Netlify to publish only that folder. It is unrelated to
the application, which needs a persistent disk and never runs on Netlify.

## Licence

[MIT](LICENSE). Copyright Christopher Schweda.
