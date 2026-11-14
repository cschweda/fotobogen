# Fotobogen Phase 0 and 1 (Foundation, Setup, Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Nuxt app that boots on a clean machine, creates its data directory, can be claimed once through a token-protected setup wizard, and guards an admin area behind a login.

**Architecture:** One Nuxt 4 app on the Nitro node-server preset. Framework-free logic (paths, secret, token, password hashing, migrations, rate limit) lives in `server/core/` as plain TypeScript with explicit `.ts` imports, so the Nitro server, the tests, and the `scripts/fotobogen.mjs` CLI (run by Node 24's type stripping) all share it. A Nitro plugin does all boot work; three server middlewares enforce the setup gate, the Origin check, and the admin guard.

**Tech Stack:** Node 24, Nuxt 4.6+, Nuxt UI v4, pnpm, better-sqlite3, Drizzle ORM and drizzle-kit, nuxt-security, zod, Vitest, Playwright, @axe-core/playwright.

**Spec:** `docs/DESIGN.md` (sections 2 to 6, 13, 14, 16) and `docs/KICKOFF_PROMPT.md`.

## Global Constraints

- Node 24 LTS in `.nvmrc`, `engines`, Dockerfile.
- No environment variable is required to run. `DATA_DIR` defaults to `./data`.
- No third-party origin at run time: system font stack in admin, icons bundled from `@iconify-json/lucide`.
- No outbound requests from the app in these phases.
- `sharp`, `exifr`, `thumbhash` are not installed yet (first used in Phase 2).
- IDs are 12-character nanoids.
- Password minimum 12 characters, maximum 256. Username 3 to 32 characters of `a-z A-Z 0-9 . _ -`.
- Rate limit: 5 failures per 15 minutes per IP, shared by login and setup-token attempts.
- Session cookie name `fotobogen`, 30 days, `HttpOnly`, `SameSite=Lax`, `Secure` unless Host is `localhost`, `127.0.0.1`, or `[::1]`.
- WCAG 2.2 AA on setup, login, and the placeholder pages.
- Commits carry no AI attribution trailers. Work on branch `phase-0-1`; never push to `main` unasked.

## Review Focus

1. `DATA_DIR` not writable (root-owned bind mount): boot must fail with one clear message naming the directory, not a stack trace.
2. Two `POST /api/setup/complete` requests racing: exactly one user row may result.
3. A password containing `<`, quotes, or non-ASCII characters must be accepted and must log in (no XSS filter mangling the body).
4. `X-Forwarded-For` sent by a client when `TRUST_PROXY` is unset must be ignored for rate limiting.
5. A corrupt or too-short `data/secret` must stop boot with a clear message rather than silently generating a new one and signing everyone out.

---

## File structure

```
server/core/paths.ts          resolveDataDir, dataPaths, ensureDataDirs
server/core/secret.ts         loadOrCreateSecret
server/core/setup-token.ts    loadOrCreateSetupToken, deleteSetupToken, tokensMatch
server/core/password.ts       hashPassword, verifyPassword, passwordStrength
server/core/migrate.ts        applyMigrations, readMigrationsFromDir
server/core/rate-limit.ts     createFailureLimiter
server/core/request.ts        isLoopbackHost, originMatchesHost, clientIpFrom
server/core/ids.ts            newId
server/db/schema.ts           all tables from DESIGN.md section 4
server/db/migrations/         drizzle-kit output
server/utils/app.ts           boot state: getDb, getSqlite, getSecret, getPaths, setup-complete cache
server/utils/settings.ts      getSetting, setSettings
server/utils/session.ts       useAdminSession, requireAdmin, signIn, signOut
server/utils/limiter.ts       the shared limiter instance, clientIp(event)
server/plugins/00.boot.ts     boot sequence
server/middleware/01.setup-gate.ts
server/middleware/02.origin.ts
server/middleware/03.admin-guard.ts
server/api/health.get.ts
server/api/setup/verify.post.ts, complete.post.ts
server/api/auth/login.post.ts, logout.post.ts, me.get.ts
server/api/admin/overview.get.ts
shared/schemas.ts             zod schemas shared by wizard and server
app/app.vue, app/layouts/default.vue
app/pages/index.vue, login.vue, setup/index.vue, admin/index.vue
app/components/setup/*.vue    one component per wizard step
app/middleware/admin.ts       client-side guard (the server guard is the real one)
scripts/fotobogen.mjs         CLI: reset-admin
scripts/rebuild.sh
deploy/Caddyfile, forge-nginx.conf, forge-deploy.sh
Dockerfile, docker-compose.yml, docker-compose.forge.yml, ecosystem.config.cjs
.github/workflows/ci.yml, release.yml
tests/unit/*.test.ts          core modules
tests/server/*.test.ts        against the built server, one temp DATA_DIR per test file
tests/helpers/server.ts       startServer({ env }) -> { url, dataDir, token, output, stop, restart }
tests/e2e/*.spec.ts           Playwright: wizard, login, axe
```

---

### Task 1: Scaffold

**Files:** `package.json`, `nuxt.config.ts`, `tsconfig.json`, `.nvmrc`, `.gitignore`, `LICENSE`, `CHANGELOG.md`, `netlify.toml`, `site/`, `app/app.vue`, `app/pages/index.vue`, `vitest.config.ts`

- [ ] Initial commit on `main` of the existing docs and placeholders; create branch `phase-0-1`.
- [ ] Look up current Nuxt 4, Nuxt UI v4, and nuxt-security docs (Context7) for config syntax.
- [ ] `package.json`: keep name, description, author, licence, keywords, homepage; add `"private": true`, `"type": "module"`, version `0.1.0`, `engines.node ">=24"`, `packageManager`, scripts `dev`, `build`, `start` (`node .output/server/index.mjs`), `test` (`vitest run`), `test:e2e` (`playwright test`), `db:generate`, `fotobogen` (`node scripts/fotobogen.mjs`), and `pnpm.onlyBuiltDependencies` for `better-sqlite3` and `esbuild`.
- [ ] `nuxt.config.ts`: modules `@nuxt/ui`, `nuxt-security`; Nitro preset `node-server`; `runtimeConfig.appVersion` from `package.json`; fonts off (system stack); icons bundled locally; security config per DESIGN section 6 (`rateLimiter: false`, `requestSizeLimiter: false`, `xssValidator: false`, no `upgrade-insecure-requests`, HSTS left to the proxy).
- [ ] `.gitignore`: `node_modules`, `.nuxt`, `.output`, `data/`, `.env`, `docs/fotobogen-site.zip`, test output.
- [ ] MIT `LICENSE`, copyright Christopher Schweda. `.nvmrc` containing `24`.
- [ ] `CHANGELOG.md` in Keep a Changelog format with an `Unreleased` section; every later task adds its line there.
- [ ] Move the placeholder page (`docs/index.html`, `docs/og.png`) to `site/` and add `netlify.toml` for it: `publish = "site"`, no build command, security headers, and an `ignore` rule so a linked repository builds only when `site/` or `netlify.toml` changes. The app itself never deploys to Netlify (DESIGN section 1).
- [ ] Verify: `pnpm build && node .output/server/index.mjs` serves `/` with status 200. Commit.

### Task 2: Core modules

**Files:** `server/core/{paths,secret,setup-token,password,rate-limit,request,ids}.ts`, `tests/unit/*.test.ts`

**Produces:**

```ts
// paths.ts
resolveDataDir(env: NodeJS.ProcessEnv, cwd: string): string
dataPaths(dataDir: string): { root, db, secret, setupToken, originals, derivatives, skins, modules }
ensureDataDirs(paths): void            // throws Error('Fotobogen cannot write to its data directory: <dir> ...')
// secret.ts
loadOrCreateSecret(file: string): string   // 43+ chars base64url; throws if file exists but is shorter than 32 chars
// setup-token.ts
loadOrCreateSetupToken(file: string): string   // 32 hex chars, file mode 0600
deleteSetupToken(file: string): void
tokensMatch(a: string, b: string): boolean     // constant time, false on length mismatch
// password.ts
hashPassword(plain: string): Promise<string>   // 'scrypt$N$r$p$<salt b64>$<hash b64>', N=2^15... see step
verifyPassword(stored: string, plain: string): Promise<boolean>   // false on malformed stored value
passwordStrength(plain: string): { score: 0 | 1 | 2 | 3 | 4, label: string }
// rate-limit.ts
createFailureLimiter(opts: { max: number, windowMs: number, now?: () => number }):
  { isBlocked(key): boolean, recordFailure(key): void, clear(key): void, retryAfterSeconds(key): number }
// request.ts
isLoopbackHost(host: string | undefined): boolean
originMatchesHost(origin: string | undefined, host: string | undefined): boolean
clientIpFrom(socketAddress: string | undefined, forwardedFor: string | undefined, trustProxy: boolean): string
// ids.ts
newId(): string   // nanoid(12)
```

- [ ] Tests first for each module, with these pinned cases:
  - `resolveDataDir({}, '/x')` is `/x/data`; `DATA_DIR=/srv/d` wins; a relative `DATA_DIR` resolves against cwd.
  - `ensureDataDirs` creates `originals`, `derivatives`, `skins`, `modules`; on an unwritable parent throws a message containing the directory path (Review Focus 1).
  - `loadOrCreateSecret` returns the same value on a second call; file mode is `0600`; a 5-character file throws (Review Focus 5).
  - `loadOrCreateSetupToken` is stable across calls; `tokensMatch('a','ab')` is false; equal tokens match.
  - `verifyPassword(await hashPassword(p), p)` is true for `'correct horse battery'`, for `'<script>"\'pässwörd 日本'` (Review Focus 3); false for a wrong password; false for `'garbage'` as the stored value.
  - Limiter: 5 failures block, 4 do not; the block lifts after `windowMs`; `clear` unblocks; keys are independent.
  - `originMatchesHost('https://a.com','a.com')` true; `'https://evil.com','a.com'` false; `undefined` false; `'http://localhost:3000','localhost:3000'` true.
  - `clientIpFrom('10.0.0.1','1.2.3.4, 5.6.7.8', true)` is `5.6.7.8`; with `false` is `10.0.0.1` (Review Focus 4).
  - `isLoopbackHost` true for `localhost`, `localhost:3000`, `127.0.0.1:8080`, `[::1]:3000`; false for `example.com`, `localhost.evil.com`.
- [ ] Implement. scrypt parameters: N=32768, r=8, p=1, 16-byte salt, 64-byte key, `maxmem` raised to fit. Strength: score from length (12, 16, 20) plus character-class variety, labels "Too short", "Weak", "Fair", "Good", "Strong".
- [ ] Run unit tests green. Commit.

### Task 3: Database

**Files:** `server/db/schema.ts`, `drizzle.config.ts`, `server/db/migrations/*`, `server/core/migrate.ts`, `tests/unit/migrate.test.ts`

**Produces:** Drizzle tables `users`, `settings`, `photos`, `derivatives`, `jobs`, `modules` exactly as DESIGN section 4 (including `users.session_version`); timestamps as integer milliseconds; `derivatives.photo_id` and `jobs.photo_id` cascade on delete.

```ts
applyMigrations(sqlite: Database, migrations: { name: string, sql: string }[]): string[]  // names applied; idempotent; each in a transaction; tracked in __migrations
readMigrationsFromDir(dir: string): { name: string, sql: string }[]                       // *.sql sorted by name
```

- [ ] Test: applying to an empty in-memory database creates all six tables; a second apply returns `[]`; a failing statement rolls its migration back.
- [ ] Write schema, run `pnpm db:generate`, implement the migrator (split on `--> statement-breakpoint`). Green. Commit.

### Task 4: Boot, health, test harness

**Files:** `server/utils/app.ts`, `server/utils/settings.ts`, `server/plugins/00.boot.ts`, `server/api/health.get.ts`, `nuxt.config.ts` (bundle migrations as Nitro server assets), `tests/helpers/server.ts`, `tests/server/boot.test.ts`

**Produces:** `getSqlite()`, `getDb()`, `getSecret()`, `getPaths()`, `isSetupComplete()`, `markSetupComplete()`, `getSetting<T>(key)`, `setSettings(record)`. Boot order: data dirs, secret, open SQLite (`journal_mode = WAL`, `foreign_keys = ON`), migrate, then if no user exists load-or-create the setup token and print:

```
Fotobogen setup token: <token>
Open the site in a browser and enter this token to finish setup.
```

Boot errors print one line starting `Fotobogen could not start:` and exit with code 1.

`GET /api/health` returns `{ "version": "0.1.0", "database": "ok", "queue": { "depth": 0 } }`, or status 503 with `"database": "error"`.

- [ ] Harness: `startServer` spawns `node .output/server/index.mjs` with a fresh temp `DATA_DIR` and a free port, waits for `/api/health`, parses the token from output. Vitest global setup builds once unless `.output` is current.
- [ ] Tests: fresh boot creates `fotobogen.db`, `secret`, `setup-token` and the four subdirectories; health returns the JSON above; the printed token equals the file's contents; after `restart()` the token and secret are unchanged; a read-only data directory exits non-zero with the clear message.
- [ ] Implement. Green. Commit.

### Task 5: Setup gate and wizard API

**Files:** `shared/schemas.ts`, `server/utils/limiter.ts`, `server/middleware/01.setup-gate.ts`, `server/middleware/02.origin.ts`, `server/utils/session.ts`, `server/api/setup/verify.post.ts`, `server/api/setup/complete.post.ts`, `tests/server/setup.test.ts`

**Produces:**

```ts
// shared/schemas.ts (zod)
setupSchema: { token, siteTitle (1-80), tagline (0-160), username, password,
               grid: 'masonry' | 'square', photoView: 'modal' | 'page', samples: boolean }
loginSchema: { username, password }
// session.ts
signIn(event, user: { id: string, sessionVersion: number }): Promise<void>
signOut(event): Promise<void>
requireAdmin(event): Promise<{ id: string, username: string }>   // throws 401
```

Responses: wrong token `401 { message }`; blocked `429` with `Retry-After`; validation failure `422 { errors: { field: message } }`; success `200 { ok: true }` with the session cookie set. Settings written: `site.title`, `site.tagline`, `layout.grid`, `layout.photo_view`, `samples.requested`, `skin.active` (`swiss`), `privacy.show_exif` (true), `privacy.show_location` (false), `privacy.allow_original_download` (false), `site.setup_complete` (true).

- [ ] Tests: before setup, `GET /`, `/admin`, `/login` redirect (302) to `/setup`; `/api/health` is 200; `GET /api/admin/overview` is 503; `POST /api/setup/verify` with a wrong token is 401 and with the right one 200; five wrong tokens then a sixth attempt is 429 even with the right token; a `POST` with no `Origin` or a foreign `Origin` is 403; `complete` with an 11-character password is 422 naming `password`; a valid `complete` returns 200 and a `fotobogen` cookie, deletes `data/setup-token`, and a second `complete` is 404; two simultaneous `complete` requests leave one user row (Review Focus 2); afterwards `/setup` and `/api/setup/verify` are 404; with `X-Forwarded-For` spoofed and `TRUST_PROXY` unset the limit still trips (Review Focus 4).
- [ ] Implement. Green. Commit.

### Task 6: Login, logout, admin guard

**Files:** `server/middleware/03.admin-guard.ts`, `server/api/auth/{login.post,logout.post,me.get}.ts`, `server/api/admin/overview.get.ts`, `tests/server/auth.test.ts`

- `POST /api/auth/login`: 200 `{ ok: true }` or 401 `{ message: 'Wrong username or password.' }` (same message and comparable timing for unknown user); 429 when blocked; success clears the count and sets `last_login_at`.
- `GET /api/auth/me`: `{ user: { username } | null }`.
- `GET /api/admin/overview`: `{ siteTitle, username, version }`.
- Guard: `/api/admin/*` without a valid session is 401; `/admin` pages redirect to `/login`; a session whose `sv` differs from the row's `session_version` is treated as absent.

- [ ] Tests: unauthenticated `/api/admin/overview` is 401 and `/admin` redirects to `/login`; login with the wizard's credentials works and `overview` is then 200; wrong password five times then the right one is 429; a password with `<`, quotes, and non-ASCII logs in; logout clears access; after a server restart the cookie still works; the cookie has `HttpOnly` and `SameSite=Lax`, has no `Secure` for Host `localhost`, and has `Secure` for Host `photos.example.com`.
- [ ] Implement. Green. Commit.

### Task 7: reset-admin CLI

**Files:** `scripts/fotobogen.mjs`, `tests/server/cli.test.ts`

`node scripts/fotobogen.mjs reset-admin [--username <name>]`. Uses `DATA_DIR`. Prompts twice with hidden input on a TTY; reads one line from stdin otherwise. Rejects passwords under 12 characters. Updates `password_hash`, increments `session_version`. Exit 0 with `Password updated for <name>. All sessions were signed out.`; exit 1 with a message when no user exists or the name is unknown. With no command, prints usage.

- [ ] Tests: after reset the old password fails and the new one works; a session cookie issued before the reset gets 401; a short password exits 1 and changes nothing.
- [ ] Implement. Green. Commit.

### Task 8: Pages (wizard, login, placeholders)

**Files:** `app/app.vue`, `app/layouts/default.vue`, `app/pages/{index,login}.vue`, `app/pages/setup/index.vue`, `app/components/setup/Step*.vue`, `app/pages/admin/index.vue`, `app/middleware/admin.ts`, `tests/e2e/{setup,login}.spec.ts`, `playwright.config.ts`

- **Look of the wizard and login:** dark mode, Swiss in style, and infographic-like. Near-black ground, off-white grotesque type in a few sizes, the single red accent `#e30613` from the placeholder page, strict grid, no rounded corners, shadows, or gradients. Progress is shown as a numbered six-frame contact strip (01 to 06, current frame red), echoing the og image. Choices such as grid layout and photo view are picked from small drawn diagrams, not bare radio labels. Load the frontend-design skill before building it. All text and focus indicators meet AA contrast on the dark ground.
- Wizard is one page with six steps held in client state. Each step is a `<form>` with an `<h1>` "Step N of 6: <name>" that receives focus on step change; Back and Continue buttons; Enter submits. Step 1 calls `verify`. Step 5 submits `complete` and maps `422` errors back to their fields, moving to the step that owns the first error. Step 6 shows links to `/` and `/admin` as ordinary links (full page loads).
- Errors: each field's message is tied to its input with `aria-describedby` and `aria-invalid`; a summary with `role="alert"` announces failures.
- Strength indicator: text label plus a meter, updated in an `aria-live="polite"` region.
- Login: username, password, one error region; on success go to `/admin`.
- `/admin`: placeholder dashboard with the site title, username, version, and a log-out button. `/`: placeholder with the site title and tagline.
- `prefers-reduced-motion` respected; visible focus everywhere.

- [ ] E2E tests (keyboard only where stated): complete the wizard using only the keyboard and land on step 6, then `/admin` shows the dashboard; a wrong token shows an announced error and focus stays usable; an 11-character password blocks step 3 with an associated error; axe reports no violations on every wizard step, on login, on `/admin`, and on `/`; log out, log in again.
- [ ] Implement. Green. Commit.

### Task 9: Deployment files and workflows

**Files:** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.forge.yml`, `deploy/{Caddyfile,forge-nginx.conf,forge-deploy.sh}`, `ecosystem.config.cjs`, `scripts/rebuild.sh`, `.env.example`, `.github/workflows/{ci,release}.yml`

- Dockerfile: `node:24-bookworm-slim` build and run stages; run stage holds `.output`, `scripts/`, `server/core/`, and a `node_modules` link so the CLI resolves `better-sqlite3`; `ENV DATA_DIR=/data HOST=0.0.0.0 PORT=3000`; `HEALTHCHECK` fetches `/api/health` with Node; no fixed `USER` beyond a non-root default of `1000:1000`.
- Both compose files: `image: ghcr.io/cschweda/fotobogen:latest`, a commented `# build: .`, `user: "${PUID:-1000}:${PGID:-1000}"`, `./data:/data`, `TRUST_PROXY=1`.
- Quick start: Caddy on 80 and 443, site address `${DOMAIN:-http://localhost}`, `/media/*` served from the data volume read-only with immutable caching, HSTS when on a domain.
- Forge: `127.0.0.1:${PORT:-3000}:3000`; nginx snippet with `client_max_body_size 50m`.
- `ci.yml`: on pull requests and pushes, Node 24, `pnpm install --frozen-lockfile`, build, `pnpm test`, Playwright with axe. `release.yml`: on `v*` tags, build and push `linux/amd64` and `linux/arm64` to GHCR tagged with the version and `latest`.

- [ ] Verify with Docker (Colima): `docker compose up` with a locally built image, token in `docker compose logs app`, wizard completes at `http://localhost`, `data/` owned by the host user, `docker compose exec app node scripts/fotobogen.mjs` prints usage. Shell scripts pass `sh -n`. Commit.

### Task 10: README and wrap-up

- [ ] `README.md` (replacing `readme.md`): `site/og.png` first, then title, status, requirements (Node 24, pnpm), local development, running the built server, tests, the Docker quick start as far as it exists, `reset-admin`, and a pointer to `docs/DESIGN.md`. Every command in it is run once to confirm it works.
- [ ] Bring `CHANGELOG.md` up to date for everything built.
- [ ] Run the six definition-of-done checks from the kickoff prompt and record the results. Commit.
