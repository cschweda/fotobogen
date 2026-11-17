# create-fotobogen

Installs [Fotobogen](https://fotobogen.com), a photo website you host
yourself, in one command:

```bash
npx create-fotobogen@latest
```

It asks which folder to put it in, fetches the newest release, installs its
packages, builds it, and offers to start it. The first start asks a few
questions of its own (the port, the site's address) and prints the address
to open in your browser.

You need a terminal, [Node.js 24](https://nodejs.org), and
[git](https://git-scm.com). If pnpm is missing, the installer offers to
install it.

## Options

```bash
npx create-fotobogen@latest fotobogen-live       # name the folder
npx create-fotobogen@latest --release 1.7.0      # a particular version
npx create-fotobogen@latest my-photos --yes      # ask nothing, do not start it
```

| Option | What it does |
|---|---|
| `folder` | Where to put it. Asked for if left out; the default is `fotobogen`. The folder must not exist yet |
| `--release <x.y.z>` | Install this version instead of the newest |
| `--yes`, `-y` | Ask nothing: take the defaults, and do not start it at the end |
| `--no-start` | Do not offer to start it at the end |
| `--version`, `-v` | Print the installer's version |
| `--help`, `-h` | Print the options |

## What it does, exactly

1. Prints its name, so you can see it has started, and checks for Node.js
   24, git, and pnpm 10. With pnpm missing or too old, it
   offers to run `npm install -g pnpm@10`. That is the only thing it ever
   installs outside the folder you name, and only if you say yes.
2. Asks for the folder. It never installs into a folder that already
   exists, empty or not, so nothing of yours can be overwritten. If the name
   is taken it says so before doing anything else, and suggests a free one
   (`fotobogen-2`).
3. Finds the newest release by listing the version tags of
   [github.com/cschweda/fotobogen](https://github.com/cschweda/fotobogen).
4. Fetches it with `git clone`, and puts the files at exactly that release.
5. Runs `pnpm install` and `pnpm build` in the folder.
6. Offers to run `pnpm start`.

These are the steps in Fotobogen's own
[installation guide](https://fotobogen.com/docs/installation/), done for
you. Because it is fetched with git, **Admin, System, Update** works
afterwards. To install several sites on one machine, run it again with
another folder name.

The folder is a complete copy of Fotobogen. It always includes
`ecosystem.config.cjs`, the settings file for running it under
[pm2](https://pm2.io) on a server, whether or not pm2 is installed, and the
Docker files. At the end the installer says how to start it under pm2, and
how to install pm2 if it is missing (`npm install -g pm2`).

On a server managed by **Laravel Forge**, which it recognises, it also says
what the site's nginx settings need: a proxy to Fotobogen, and
`client_max_body_size 50m;` so that uploads are not refused. The
[installation guide](https://fotobogen.com/docs/installation/) has the
whole of it.

It has no dependencies: the package is two small files you can read in a
minute, in [`bin`](bin) and [`lib`](lib). It collects nothing and contacts
nothing but GitHub (to fetch Fotobogen) and the npm registry (for
Fotobogen's packages).

If a step fails, it says which, and how to carry on by hand from where it
stopped.

## Licence

MIT, as Fotobogen is.
