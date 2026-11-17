# Changelog

The installer has version numbers of its own, apart from Fotobogen's: it
installs whatever release of Fotobogen is newest when it is run.

## [1.0.0] - 2026-11-17

The first release under the name `fotobogen`. (The same installer was published earlier the same day as `create-fotobogen` 1.0.0, before the name was settled.)

- `npx fotobogen@latest` (or `npx fotobogen@latest install`) checks for Node.js 24, git, and pnpm 10, asks for a folder, fetches the newest release of Fotobogen with git, installs its packages, builds it, and offers to start it.
- `--release` installs a particular version; `--yes` asks nothing; `--no-start` does not offer to start it.
- With pnpm missing or too old, it offers to install pnpm 10.
- It never installs into a folder that already exists. It says so before doing anything else, names the version of Fotobogen the folder holds if it is an install, and suggests a free name.
- When a step fails it says how to carry on by hand.
- It prints the name Fotobogen in large letters when it starts, and ends by saying how to start it, by hand or under pm2. The pm2 settings file is in every install; when pm2 itself is missing, it says how to install it.
- It recognises a server managed by Laravel Forge, and says what the site's nginx settings need: a proxy to Fotobogen, and `client_max_body_size` for uploads.
- Started with npx, it does not pass npm's own settings on to pnpm, which made Fotobogen's install check refuse.
