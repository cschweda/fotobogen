# Phase 2: Upload and Processing Pipeline — Implementation Plan

**Goal:** An admin can upload photographs; each is checked, stored, and turned into web-sized derivatives by a one-at-a-time queue that stays within 1 GB of memory.

**Architecture:** The pipeline is plain TypeScript under `server/pipeline/` and `server/storage/`, written without Nitro auto-imports so the same code runs inside the server and from the CLI (`pnpm seed:fetch`). Every function takes a `PipelineContext` (`sqlite`, `storage`, `limits`). The server wires it up at boot and exposes it through `/api/admin/photos` and `/media/`.

**Tech stack:** `sharp` 0.35 (concurrency 1, cache off), `exifr` 7, `thumbhash`, `busboy` (streaming multipart), better-sqlite3.

**Spec:** `docs/DESIGN.md` sections 4, 6, 7, 12, 14, 15.

## Global constraints

- Accepted input: JPEG, PNG, WebP, TIFF, AVIF. Validated by decoding, never by extension or declared type.
- Limits: `MAX_UPLOAD_MB` (default 50), `MAX_MEGAPIXELS` (default 100).
- Derivatives are WebP: `thumb` 480 px wide; `square` 480 x 480 attention crop; `medium` 1280 px long edge; `large` 2560 px long edge. Never upscale.
- Derivative file names: `<id>-<kind>-<hash8>.webp`.
- Queue: one job at a time; a job left `running` at boot is requeued; three attempts, then `failed` with the error stored.
- Only `server/storage/` builds filesystem paths for originals and derivatives.
- Server code uses the `nuxt/server` API. Pipeline code uses explicit `.ts` imports and no auto-imports.
- No photographs are committed. The only outbound request is the sample fetch, run on request.
- Must work on Windows as well as macOS and Linux (CI runs both).

## Rulings made while planning

- **Small originals.** "Skip a size the original cannot fill" would leave a 1000 px photo with no photo-view image. Each kind is rendered at `min(target, original)`; `large` is skipped when it would equal `medium`. `thumb`, `square`, and `medium` always exist. Nothing is upscaled. Cost if wrong: one extra small file per small photo.
- **One decode.** The original is decoded once into a working raster of at most 2560 px on the long edge (rotated, sRGB, 8-bit); all derivatives and the thumbhash come from that. This is what keeps a 40 MP JPEG inside 1 GB.
- **Upload page in this phase.** Section 9 lists Upload under admin (Phase 4), but Phase 2 cannot be tested by hand without one. A minimal `/admin/upload` page ships now: picker, drag and drop, per-file progress and result, retry for failures. The library proper stays in Phase 4.
- **`/media/` route in this phase.** The app serves derivatives itself (section 14.1), so uploads can be seen without a proxy.
- **`pnpm seed:fetch` is a development command** (section 12 says so). It needs a full checkout with `node_modules`; it is not shipped in the Docker image. The wizard and admin wiring is Phase 6.
- **Temp files** live in `data/tmp/`, on the same disk as the originals so the final move is a rename. It is emptied at boot.

## Review focus

1. An upload that is not an image at all, or is an accepted extension wrapping another format (a GIF named `.jpg`).
2. A decompression bomb: small file, enormous pixel count.
3. Two uploads of the same file arriving at the same moment.
4. The server stopping mid-job; a job that fails three times.
5. A path-traversal attempt on `/media/`.

## Tasks

1. **Pure helpers** — `server/pipeline/plan.ts` (`planDerivatives(width, height)`), `slug.ts` (`slugify`, `uniqueSlug`), `exif.ts` (`exifColumns(parsed)`, `exifForStorage(parsed)`), `limits.ts` (`readLimits(env)`). Tests: `tests/unit/{plan,slug,exif,limits}.test.ts`.
2. **Storage adapter** — `server/storage/types.ts` (`Storage`: `put`, `get`, `delete`, `exists`, `publicUrl`, `localPath`), `server/storage/local.ts`. Keys are forward-slash names; anything else is refused. Test: `tests/unit/storage.test.ts`.
3. **Pipeline** — `server/pipeline/context.ts`, `accept.ts` (`acceptUpload`), `render.ts` (`processPhoto`), `queue.ts` (`createQueue`: `recover`, `kick`, `idle`, `retry`). Tests against a temp directory and a real database: `tests/unit/{accept,render,queue}.test.ts`.
4. **Server wiring** — `data/tmp`; boot configures sharp, recovers and starts the queue; `POST /api/admin/photos` (multipart `file`), `GET /api/admin/photos`, `POST /api/admin/photos/[id]/retry`, `GET /media/[name]`. Tests: `tests/server/upload.test.ts` (accepted, becomes ready, duplicate, not an image, too large, too many pixels, unauthenticated, traversal, restart recovery, 40 MP JPEG).
5. **Upload page** — `app/pages/admin/upload.vue`, link from the dashboard. Test: `tests/e2e/upload.spec.ts` with axe.
6. **Sample photos** — `seed/manifest.json` (25 entries), `seed/README.md`, `server/pipeline/samples.ts` (`fetchSamples`), `scripts/fotobogen.mjs seed-fetch`, `pnpm seed:fetch`. Test: `tests/unit/samples.test.ts` with a fake `fetch`.
7. **Deployment and docs** — Dockerfile, compose files, nginx and Caddy limits, `.env.example`, README, CHANGELOG, DESIGN.md decisions; 40 MP run in a 1 GB container.
