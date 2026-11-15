# The public API

Every Fotobogen site answers a small read-only JSON API: the same data its own public pages are built from. Use it to show your photographs somewhere else, in a different front end, an app, or a widget on another site.

- **Read-only.** There is nothing to log in to and nothing can be changed through it.
- **Public only.** It returns exactly what a visitor can see: processed, public photos whose publication time has come. Hidden photos, drafts, scheduled photos, and hidden albums never appear. Camera details and location follow the site's privacy settings.
- **Open to browsers on other sites.** Responses carry `Access-Control-Allow-Origin: *`.
- **Versioned.** Every response carries `X-Fotobogen-API: 1`. Fields may be added at any time; a field is removed or changes meaning only with a new number, noted in the [changelog](../CHANGELOG.md).

The admin's own endpoints under `/api/admin/` are not part of this; they need a login and may change between versions.

## Contents

- [Site](#site)
- [Photos](#photos)
- [One photo](#one-photo)
- [Albums](#albums)
- [One album](#one-album)
- [One tag](#one-tag)
- [Slideshow](#slideshow)
- [Images](#images)
- [Feeds](#feeds)
- [Health](#health)
- [Errors](#errors)

## Site

`GET /api/site`

```json
{
  "title": "Kodachrome Days",
  "tagline": "Slides from the shoebox",
  "grid": "masonry",
  "photoView": "modal",
  "skinVersion": "126418a685",
  "mode": "dark",
  "brand": { "icon": null, "logo": null },
  "language": "en",
  "text": { "navPhotos": "Fotografias" },
  "seo": { "homeTitle": "", "titlePattern": "{page} | {site}", "description": "", "indexing": true, "siteUrl": "", "author": "", "twitter": "", "googleVerification": "", "bingVerification": "", "card": null },
  "hasAlbums": true
}
```

`brand` holds the owner's icon (`small`, `touch`, `large` addresses) and logo (`light` and `dark`, each with `url`, `width`, `height`), or `null` for each that is not set. `language` is the language code of the site's text. `text` holds the owner's replacements for the fixed text on the pages, keyed as in [`shared/site-text.ts`](../shared/site-text.ts); a key that is absent uses the default there. `seo` is what the owner set under Search and sharing; `card` is the picture used when the site is shared (`url`, `width`, `height`, `alt`), or `null`.

## Photos

`GET /api/photos?page=1`

Thirty photos a page, newest first (the order set in the library).

```json
{
  "page": 1,
  "pages": 3,
  "total": 74,
  "tiles": [
    {
      "slug": "crossing",
      "title": "Crossing",
      "alt": "A man in a dark suit walking across grey asphalt.",
      "placeholder": "data:image/png;base64,…",
      "thumb": { "url": "/media/bxIjUHae-4Jn-thumb-0c1d2e3f.webp", "width": 480, "height": 320 },
      "square": { "url": "/media/bxIjUHae-4Jn-square-4a5b6c7d.webp", "width": 480, "height": 480 },
      "span": 13
    }
  ]
}
```

- `alt` is the photo's alt text, or its title, or empty.
- `placeholder` is a tiny blurred image to show while the real one loads.
- `span` is for the masonry grid: rows the photo needs when a row is a twentieth of a column's width (see [SKINS.md](SKINS.md)).

A page past the end returns an empty `tiles`.

## One photo

`GET /api/photos/<slug>`

```json
{
  "slug": "crossing",
  "title": "Crossing",
  "description": "A man in a suit walks across an empty road.",
  "alt": "A man in a dark suit walking across grey asphalt.",
  "placeholder": "data:image/png;base64,…",
  "takenAt": 1714694400000,
  "exif": { "camera": "Leica M11", "lens": "Summilux-M 35", "focalLength": "35 mm", "aperture": "f/2.8", "shutter": "1/250 s", "iso": 400 },
  "location": null,
  "images": [
    { "url": "/media/bxIjUHae-4Jn-medium-60fd4c19.webp", "width": 1280, "height": 854 },
    { "url": "/media/bxIjUHae-4Jn-large-9e8d7c6b.webp", "width": 2560, "height": 1707 }
  ],
  "tags": [{ "slug": "street", "name": "street" }],
  "albums": [{ "slug": "road-trip", "title": "Road Trip" }],
  "licence": { "label": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/" },
  "download": { "url": "/api/photos/crossing/download", "original": false },
  "previous": "valley-in-mist",
  "next": "open-book"
}
```

- `takenAt` is milliseconds since 1970, or `null`.
- `exif` is `null` when the site does not show camera details. `location` is `null` unless the site shows locations.
- `images` runs from smallest to largest; small originals have fewer.
- `download` is `null` unless visitors may download the photo. `original` says whether the download is the file as uploaded or a copy with camera data removed.
- `previous` and `next` are slugs, or `null` at either end.

## Albums

`GET /api/albums`

```json
{ "albums": [{ "slug": "road-trip", "title": "Road Trip", "description": "Three days north.", "count": 12, "cover": { "url": "/media/…-square-….webp", "width": 480, "height": 480 } }] }
```

Only public albums with at least one visible photo.

## One album

`GET /api/albums/<slug>?page=1`

The album, then a page of its photos in the album's own order, in the same shape as [Photos](#photos):

```json
{ "album": { "slug": "road-trip", "title": "Road Trip", "description": "Three days north.", "count": 12, "cover": { "url": "…", "width": 480, "height": 480 } }, "page": 1, "pages": 1, "total": 12, "tiles": [] }
```

## One tag

`GET /api/tags/<slug>?page=1`

```json
{ "tag": { "slug": "street", "name": "street" }, "page": 1, "pages": 1, "total": 9, "tiles": [] }
```

## Slideshow

`GET /api/slideshow`, `GET /api/slideshow?album=<slug>`, `GET /api/slideshow?tag=<slug>`

Up to 500 photos with what a slideshow needs, plus the timing and order set in the admin. It never includes a location.

```json
{
  "title": null,
  "back": "/",
  "seconds": 8,
  "order": "sequence",
  "slides": [{ "slug": "crossing", "title": "Crossing", "description": "…", "alt": "…", "takenAt": null, "camera": "Leica M11, 35 mm, f/2.8", "images": [{ "url": "…", "width": 1280, "height": 854 }] }]
}
```

## Images

Image addresses are relative to the site (`/media/<name>.webp`). Each name contains a hash of the file's contents, so an address never changes what it shows and can be cached for good; when a photo is re-rendered (a new film look, say) it gets new addresses. Fetch the JSON again rather than storing image addresses for long.

All images are WebP. Sizes: `thumb` 480 px wide, `square` 480 × 480, `medium` 1280 px on the long edge, `large` 2560 px. Nothing is enlarged, so a small photo has smaller copies.

## Feeds

- `GET /feed.xml`: RSS of the thirty newest photos.
- `GET /sitemap.xml`: the home page, albums, and every public photo.

## Health

`GET /api/health` (also `HEAD`): see the [README](../README.md#health-check).

## Errors

A photo, album, or tag that does not exist, or that a visitor may not see, is a `404`. Before a site has been set up, the API answers `503`.

```json
{ "status": 404, "message": "There is no such photo." }
```
