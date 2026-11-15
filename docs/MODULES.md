# Writing and installing a module

A module changes how photos look: a film look, a border, a tint. Three come with Fotobogen and double as worked examples:

- [`modules/filmframe`](../modules/filmframe/index.mjs): makes a photo look contact printed, with the negative's border, sprocket holes, and made-up stock markings. It changes the photo's size.
- [`modules/filmlooks`](../modules/filmlooks/index.mjs): tone and grain in the manner of a few kinds of film. It keeps the photo's size.

Each bundled module has a **Sharpening** slider, from 0 (none) to 100. Around 25 is what a print or scan is normally given; 60 and up gives the crisp look of a sharp lens on black-and-white film. Film looks starts at 25; the frame and the watermark start at 0. The function is a dozen lines (`sharpened` in each `index.mjs`) and can be copied into a module of your own. A [skin](SKINS.md#a-look-for-every-photo) can set a module's look for every photo.
- [`modules/watermark`](../modules/watermark/index.mjs): a line of text in a corner. It shows a `text` parameter and drawing over the photo.

> **New to this?** The step-by-step guide, with five worked examples, is at [fotobogen.com/docs/writing-a-module](https://fotobogen.com/docs/writing-a-module/). This file is the reference.

## Contents

- [Starting and testing a module from the command line](#starting-and-testing-a-module-from-the-command-line)
- [Installing a module](#installing-a-module)
- [Do I have to rebuild anything?](#do-i-have-to-rebuild-anything)
- [What a module is](#what-a-module-is)
- [A complete small module](#a-complete-small-module)
- [Parameters](#parameters)
- [The apply function](#the-apply-function)
- [What modules can and cannot do](#what-modules-can-and-cannot-do)
- [How the admin uses a module](#how-the-admin-uses-a-module)
- [When something goes wrong](#when-something-goes-wrong)

## Starting and testing a module from the command line

Two commands, run from a checkout of Fotobogen, save writing the first file by hand and tell you whether a module works before you install it anywhere.

```bash
pnpm fotobogen module new my-module     # writes data/modules/my-module/ with a working example
pnpm fotobogen module test my-module    # runs it on a test picture and reports
```

`module new` writes a `module.json` and an `index.mjs` holding one small transform with one slider, ready to edit.

`module test` loads the module the way the server does and runs each transform with its default settings, at a large size (2560 pixels) and a small one (240), twice each. It writes each result as a WebP into `./module-test` so you can look at it, prints a line for each check, and marks anything wrong with FAIL: a mistake in `module.json`, a transform that throws or returns an empty picture, or one that gives a different result the second time (randomness must be seeded from the photo's size, or the picture would change on every render). Use `--image photo.jpg` to try it on a photo of your own and `--out <folder>` to write somewhere else. A name means the module in `data/modules`; anything else is read as a folder, so a module kept elsewhere can be tested too.

## Installing a module

1. Copy the module's folder into `data/modules/` on the server, so that you have `data/modules/<name>/module.json`.
2. Restart Fotobogen (`docker compose restart app`, or `pm2 restart fotobogen`).
3. Open **Admin, Modules**. The module is listed, switched off. Switch it on.

To remove one, switch it off, delete its folder, and restart. Photos that used it go back to how they were uploaded.

## Do I have to rebuild anything?

No. Some systems (Strapi is one) compile their admin panel, so adding a plugin means rebuilding the whole admin. Fotobogen does not work that way:

- A module is loaded by the **server** when it starts. It is plain JavaScript in a folder; there is no build step and no package to install.
- The **admin** has no code for any particular module. A module declares its parameters ("a number from 2 to 14 called thickness"), the server passes those declarations to the admin, and the admin draws a slider, a menu, or a checkbox for each. That is why a new module's controls appear without the admin being touched.

The cost of this is a limit: a module cannot add its own screens or its own kind of control to the admin. It gets sliders, menus, checkboxes, and one-line text fields.

## What a module is

A folder with two files:

```
data/modules/sepia/
├── module.json
└── index.mjs
```

`module.json` describes it. The `name` must be the folder's name: lowercase letters, digits, and hyphens.

```json
{
  "name": "sepia",
  "version": "1.0.0",
  "label": "Sepia",
  "description": "A warm brown tone.",
  "entry": "index.mjs"
}
```

The entry file exports the module's transforms.

## A complete small module

```js
// data/modules/sepia/index.mjs
export default {
  transforms: [
    {
      id: 'tone',
      label: 'Sepia tone',
      description: 'Black and white, tinted warm.',
      params: {
        warmth: { type: 'range', label: 'Warmth', min: 0, max: 100, step: 5, default: 60 },
        fade: { type: 'boolean', label: 'Faded blacks', default: false },
      },
      apply(image, params) {
        // tint() keeps each pixel's brightness and replaces its colour.
        // Blend from neutral grey to brown as warmth goes up.
        const amount = params.warmth / 100
        let toned = image.removeAlpha().tint({ r: 128 + 40 * amount, g: 128 - 6 * amount, b: 128 - 60 * amount })
        if (params.fade) toned = toned.linear(0.9, 20)
        return toned
      },
    },
  ],
}
```

That is the whole module. There is nothing to import: `image` is a [sharp](https://sharp.pixelplumbing.com) pipeline, and anything sharp can do to a picture is available on it.

## Parameters

Each parameter is one of four kinds. The admin builds the control; the server checks every value before `apply` sees it, so `apply` can trust what it is given.

| Type | Declaration | Control | What `apply` receives |
|---|---|---|---|
| `range` | `{ type: 'range', min, max, step, default }` | Slider | A number between `min` and `max` |
| `select` | `{ type: 'select', options: [...], default }` | Menu | One of the listed strings |
| `boolean` | `{ type: 'boolean', default }` | Checkbox | `true` or `false` |
| `text` | `{ type: 'text', default, maxLength }` | One-line text field | A string of at most `maxLength` characters (80 unless you say; 200 at most), with no line breaks |

All four take an optional `label`. Text is drawn by your module, and the server has no fonts you can count on: the bundled watermark draws its letters as dots for that reason. Parameter names are letters and digits.

## The apply function

```js
apply(image, params, context)
```

- `image`: the photo as a sharp pipeline, upright, in sRGB, at most 2560 px on its long side.
- `params`: the values for this photo, already checked.
- `context.width`, `context.height`: the size of `image` in pixels.
- `context.sharp`: the sharp function itself, for building a new picture. A module that only adjusts the photo does not need it. One that draws around the photo does: the film frame builds its border as an SVG, opens it with `context.sharp`, and lays the photo on top.

Return a sharp pipeline, or a promise of one. The result may be a different size from what came in.

Two things to keep in mind:

- **Use proportions, not pixels.** The same recipe is run on a small copy for the preview and on a large one for the real thing. The film frame's border is a percentage of the photo's shorter side, so it looks the same at both sizes.
- **Give the same input the same output.** If you need randomness, seed it from the photo's size, as both bundled modules do. Otherwise the picture changes every time it is rendered.

## What modules can and cannot do

They can change the picture, in any way sharp allows, and change its size (up to 40 megapixels).

They cannot add screens or controls to the admin, read or change a photo's title or other details, or change the uploaded file: Fotobogen keeps the original untouched and builds every copy from it plus the list of transforms, so switching a transform off always gets the photo back exactly.

**A module is trusted code.** It runs inside the server with the server's permissions, like a WordPress plugin. Install only modules you have read or trust. There is no way to install one through the admin; it has to be put on the server's disk.

## How the admin uses a module

- **Admin, Modules** lists every module, each switched off until you switch it on. Under "For all photos" you choose transforms for the whole site, including photos uploaded later.
- **Admin, Photos**, then a photo, lets that one photo use the site's setting or have its own. A preview shows the change before it is saved.
- Transforms run in the order the modules are listed: looks first, then the frame, so grain is not printed on the border.
- Under the photo on its edit page is a strip of small previews, one per look: each transform with its default settings. **If a transform's first parameter is a `select`, the strip shows one preview for every option in it**, which is how the film looks appear side by side. Put the menu that defines the look first if you want that.

## When something goes wrong

A module that cannot be loaded does not stop the site. It is listed under Modules with the reason, and the server log has the same line, for example:

```
Module "sepia" could not be loaded: Transform "tone" needs an "apply" function.
```

If `apply` throws while a photo is being rendered, that photo is marked as failed with the error, like any other processing failure, and can be retried once the module is fixed or switched off.
