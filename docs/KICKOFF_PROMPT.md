# Fotobogen — Claude Code Kickoff Prompt

Paste everything below the line into Claude Code from the root of the `cschweda/fotobogen` repository. The repository holds only `docs/` (this file, `DESIGN.md`, and the fotobogen.com placeholder page), a placeholder `package.json`, and a placeholder `readme.md`.

---

You are building **Fotobogen**, a self-hosted, installable photo website ("WordPress for photos"). The full specification is in `docs/DESIGN.md` in this repository. Read it completely before writing any code. It is the source of truth; where this prompt and the design document disagree, stop and ask.

## Why this project exists

One person should be able to install Fotobogen on a 1 GB DigitalOcean droplet, answer a handful of first-run questions, and have a public photo site with an admin backend. Other people will install it too, so anything that only works on the author's machine is a bug. The server is small, so memory discipline in the image pipeline matters more than throughput.

## Stack

Node 24 LTS, Nuxt 4.6 or later (SSR, Nitro node-server preset), Nuxt UI v4, pnpm, SQLite through `better-sqlite3` with Drizzle ORM, `sharp`, `exifr`, `thumbhash`, `nuxt-security` (headers and CSP only). Auth uses Nuxt's built-in `useSession` with the secret from `data/secret` and scrypt from `node:crypto`; `nuxt-auth-utils` is deliberately not used (DESIGN.md section 6 explains why). Tests use Vitest and Playwright with axe. TypeScript throughout.

Before scaffolding, look up the current documentation for Nuxt, Nuxt UI, and nuxt-security and use the APIs as they are documented today. Do not write these from memory; they have changed between versions.

The existing `package.json` is the placeholder published to npm to reserve the name. Keep its name, description, author, licence, and keywords; add `"private": true` so the app is never published by accident. The placeholder page for fotobogen.com moves from `docs/` to `site/` (`index.html`, `og.png`), with a `netlify.toml` that publishes only that folder. Add `docs/fotobogen-site.zip` to `.gitignore`.

## Scope of this session: Phase 0 and Phase 1 only

**Phase 0: foundation**

- Scaffold the app with the directory layout in DESIGN.md section 3. Pin Node 24 in `.nvmrc`, `engines`, and the Dockerfile.
- Resolve `DATA_DIR` (default `./data`) and create it and its subdirectories at boot if missing.
- Define the complete Drizzle schema from section 4, all tables, even those unused until later phases. Open SQLite in WAL mode. Run migrations automatically at boot.
- Generate the session secret into `data/secret` at first boot if absent.
- Add `/api/health` returning app version, database status, and queue depth (zero for now).
- Add the deployment files described in section 14: the `Dockerfile`, `docker-compose.yml` (quick start with Caddy), `docker-compose.forge.yml` (app only, bound to 127.0.0.1, for a Forge server with nginx already installed), `deploy/forge-nginx.conf`, `deploy/forge-deploy.sh`, `deploy/Caddyfile`, `ecosystem.config.cjs`, and `scripts/rebuild.sh`.
- Add the GitHub Actions workflow that builds and publishes the image to GHCR on tagged releases. Both compose files should pull that image by default and include a commented-out `build:` line for local builds.
- Add `.nvmrc`, a `CHANGELOG.md` (Keep a Changelog format, updated as work lands), and `netlify.toml` for the placeholder page only.
- Add an MIT `LICENSE` (copyright Christopher Schweda). No photographs are ever committed; sample photos are fetched from Lorem Picsum at the admin's request (section 12), which is built in Phase 2.

**Phase 1: setup and auth**

- Implement the setup token, the redirect middleware, and the six-step wizard exactly as specified in section 5.
- Implement login, logout, the sealed-cookie session, and server-side guards on every `/admin` page and `/api/admin/*` route, per section 6.
- Add the Origin check for mutating requests and the hand-written rate limit, shared by login and setup-token attempts. Honour `TRUST_PROXY` as section 6 describes.
- Add the `pnpm fotobogen reset-admin` CLI. It must also work inside the container and must sign out existing sessions.
- After setup, `/admin` should show a placeholder dashboard and `/` a placeholder public page. Do not build the real ones yet.
- In wizard step 5, record the download-or-start-empty choice for sample photos in settings. The fetch itself arrives in a later phase; the app makes no outbound requests in this session.

Do not start Phase 2. No upload handling, no image processing, no skins, no modules in this session.

## How to work

- A pre-build review was done on 2026-11-14 and its outcomes are in DESIGN.md (section 16 lists them). Begin by giving me a short plan for Phases 0 and 1 and anything further you find ambiguous or think is a mistake. Wait for my reply before coding.
- Commit in small, coherent steps with clear messages. Work on a feature branch and open a pull request against `staging`. `main` is updated only by a single `staging` to `main` pull request (merge commit, never squash) when I ask for it.
- Write tests as you go. At minimum, cover: a fresh install redirects pages to `/setup` and answers `/api/health`; the token survives a restart; the wizard rejects a wrong token; setup cannot be completed twice; `/setup` returns 404 after completion; `/api/admin/*` rejects unauthenticated requests; a mutating request with a missing or foreign `Origin` is rejected; the rate limit triggers; `reset-admin` invalidates an existing session. Add axe checks for the wizard and login.
- Accessibility is a requirement from the first screen, not a later pass. The wizard and login must be fully keyboard-operable, with labelled fields, errors associated with their inputs and announced, and visible focus. Target WCAG 2.2 AA.
- Prefer boring, readable code over clever abstractions. This project will be read by people deciding whether to trust it on their own server.
- If a dependency in the stack does not fit a requirement, tell me and propose an alternative rather than working around it silently.

## Definition of done for this session

1. `pnpm install && pnpm build && node .output/server/index.mjs` on a clean checkout boots the app, creates `data/`, and prints a setup token.
2. I can complete the wizard in a browser using that token and land in `/admin` logged in. The same works after `docker compose up` with a locally built image, with the token read from `docker compose logs app` and `data/` owned by the host user.
3. Restarting the server keeps me logged in and does not regenerate the token.
4. Visiting `/setup` afterward returns 404.
5. All tests pass.
6. `README.md` has accurate local-development instructions for what exists so far, with `site/og.png` as the very first thing in the file and any badges beneath it.

When you reach that point, stop and summarize what was built, what you deviated from in DESIGN.md and why, and what you recommend deciding before Phase 2.
