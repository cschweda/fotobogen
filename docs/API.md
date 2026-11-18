# The public API

Every Fotobogen site answers a small read-only JSON API: the same data its own public pages are built from. Use it to show your photographs somewhere else, in a different front end, an app, or a widget on another site.

- **Read-only.** There is nothing to log in to and nothing can be changed through it.
- **Public only.** It returns exactly what a visitor can see: processed, public photos whose publication time has come. Hidden photos, drafts, scheduled photos, and hidden albums never appear. Camera details and location follow the site's privacy settings.
- **Open to browsers on other sites.** Responses carry `Access-Control-Allow-Origin: *`.
- **Versioned.** Every answer from an address under `/api/photos`, `/api/albums`, `/api/tags`, `/api/slideshow`, `/api/search`, `/api/pages`, and `/api/site` carries `X-Fotobogen-API: 1` (the health check and the feeds do not, nor does the `503` before setup). Fields may be added at any time; a field is removed or changes meaning only with a new number, noted in the [changelog](../CHANGELOG.md).

The admin's own endpoints under `/api/admin/` are not part of this; they need a login and may change between versions.

## Contents

- [Site](#site)
- [Photos](#photos)
- [One photo](#one-photo)
- [Albums](#albums)
- [One album](#one-album)
- [One tag](#one-tag)
- [Slideshow](#slideshow)
- [Search](#search)
- [One page](#one-page)
- [A private album](#a-private-album)
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
  "menu": [{ "label": "About", "href": "/about", "external": false }],
  "homeOrder": "random",
  "frontAlbums": [{ "slug": "road-trip", "title": "Road Trip" }],
  "hasAlbums": true
}
```

`brand` holds the owner's icon (`small`, `touch`, `large` addresses) and logo (`light` and `dark`, each with `url`, `width`, `height`), or `null` for each that is not set. `language` is the language code of the site's text. `text` holds the owner's replacements for the fixed text on the pages, keyed as in [`shared/site-text.ts`](../shared/site-text.ts); a key that is absent uses the default there. `seo` is what the owner set under Search and sharing; `card` is the picture used when the site is shared (`url`, `width`, `height`, `alt`), or `null`.

## Photos

`GET /api/photos?page=1`

Thirty photos a page, newest first (the order set in the library). That is always the order here, whatever the site's own front page shows. For a shuffle, add `order=random&seed=<a whole number>`: the photos are dealt in a random order that is the same for every page asked for with the same seed, so pages do not repeat or miss photos. `order=sequence` is the library's order, the same as leaving it out. `order=random` without a `seed` of one to ten digits, and any other `order`, answers `400`.

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
  "size": { "width": 6000, "height": 4000 },
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
- `exif` is `null` when the site does not show camera details, and so is `size`, the photograph's size in pixels as uploaded. `location` is `null` unless the site shows locations.
- `images` runs from smallest to largest; small originals have fewer.
- `download` is `null` unless visitors may download the photo. `original` says whether the download is the file as uploaded or a copy with camera data removed.
- `previous` and `next` are slugs, or `null` at either end.

## Albums

`GET /api/albums`

```json
{ "albums": [{ "slug": "road-trip", "title": "Road Trip", "description": "Three days north.", "count": 12, "cover": { "url": "/media/…-square-….webp", "width": 480, "height": 480 } }] }
```

Only public albums with at least one visible photo. A private album (one reached by a secret link) is never in the public API.

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

Up to 500 photos with what a slideshow needs, plus the timing and order set in the admin. `camera` and `size` are `null` when the site hides camera details; `albums` lists public albums only. It never includes a location.

```json
{
  "title": null,
  "back": "/",
  "seconds": 8,
  "order": "sequence",
  "slides": [{ "slug": "crossing", "title": "Crossing", "description": "…", "alt": "…", "takenAt": null, "camera": "Leica M11, 35 mm, f/2.8", "size": { "width": 6000, "height": 4000 }, "tags": [{ "slug": "street", "name": "street" }], "albums": [{ "slug": "city", "title": "City" }], "licence": { "label": "All rights reserved", "url": null }, "images": [{ "url": "…", "width": 1280, "height": 854 }] }]
}
```

To show the slideshow inside another site's page without writing any code, use the ready-made one: **Admin, Embed on another site** gives an `<iframe>` to paste (see the [README](../README.md#making-the-site-your-own)).

## Images

Image addresses are relative to the site (`/media/<name>.webp`). Each name contains a hash of the file's contents, so an address never changes what it shows and can be cached for good; when a photo is re-rendered (a new film look, say) it gets new addresses. Fetch the JSON again rather than storing image addresses for long.

All images are WebP. Sizes: `thumb` 480 px wide, `square` 480 × 480, `medium` 1280 px on the long edge, `large` 2560 px. Nothing is enlarged, so a small photo has smaller copies.

## Search

`GET /api/search?q=<words>&page=1`

The public photos that match, in the same shape as [Photos](#photos), with `query`: what was asked for, trimmed.

```json
{ "query": "sea road", "page": 1, "pages": 1, "total": 2, "tiles": [] }
```

Every word must be found, in capitals or small letters (for the letters a to z; accented letters must match exactly), somewhere in a photo's title, description, alt text, tags, or the titles of the public albums it is in. Up to six words and 100 characters are used. An empty search finds nothing. Only what a visitor can see is searched: not hidden photos, not photos in the trash, not the names of hidden albums.

## One page

`GET /api/pages/<slug>`

A page the owner wrote, such as About. `/api/site` lists the ones in the menu, under `menu`, followed by the owner's own links (`external` is `true` for a link to another site).

```json
{ "slug": "about", "title": "About", "body": "I photograph the **coast**.\n\n## Contact\n\nWrite to me@example.com." }
```

`body` is plain text with a little marking, never HTML: an empty line between paragraphs, `## ` and `### ` for headings, `- ` for list items, `**bold**`, `*italic*`, and `[words](address)` for links. Web and email addresses written out are links too. If you draw it yourself, treat it as text; [`shared/page-text.ts`](../shared/page-text.ts) reads it into pieces and allows a link only to an `http(s)` address, a `mailto:` address, or a path on the site. A hidden page answers `404`.

## A private album

`GET /api/private/<token>?page=1` and `GET /api/private/<token>/photos/<slug>`

What the page at a private album's secret link is made from: the album (`title`, `description`, `count`) with a page of its photos, and one of its photos. The token is the last part of the link the owner copies in the admin; whoever has it can read the album, and a wrong one is a `404`. A photo here carries no tags, albums, location, or download. Unlike the rest of this API, these answers do not allow reading from another site's pages in a browser, are never cached, and are marked not to be indexed.

## Feeds

- `GET /feed.xml`: RSS of the thirty newest photos.
- `GET /sitemap.xml`: the home page, the list of albums, each public album, your pages, and every public photo.

## Health

`GET /api/health` (also `HEAD`): see the [README](../README.md#health-check).

## Errors

A photo, album, tag, or page that does not exist, or that a visitor may not see, is a `404`. A request that is not understood, such as `order=random` with no seed, is a `400`. Both have this shape; read `statusCode` and `message`:

```json
{
  "error": true,
  "url": "https://photos.example.com/api/photos/no-such-photo",
  "statusCode": 404,
  "statusMessage": "Not Found",
  "message": "There is no such photo."
}
```

Before a site has been set up, the API answers `503` with `{ "message": "Fotobogen has not been set up yet." }`.

Go by the HTTP status. `message` is for people, is not on every error (the `503` has one; a missing download has none), and its wording may change.

## The admin API, with a token

Everything above is public and read-only. The admin's own API, under `/api/admin/`, needs a login, or an **API token** made under **Admin, API tokens**. A `manage` token reaches everything about albums, a private album's link included, so give one only to a program of your own. A token is sent in a header:

```
Authorization: Bearer fb_…
```

A request with a token needs no cookie and no `Origin` header, and is judged by the token alone. There are two kinds:

| Kind | Allowed |
|---|---|
| `upload` | `POST /api/admin/photos` (upload), `GET /api/admin/photos` (list), `GET /api/admin/photos/<id>`, `POST /api/admin/photos/<id>/retry` |
| `manage` | Everything under `/api/admin/photos` and `/api/admin/albums`, and `GET /api/admin/overview` |

Anything else answers `403`. No token can reach settings, skins, site text, pages, the menu, visitor statistics, embedding, backups, restore, or the tokens themselves. A wrong or revoked token answers `401`. A header that is not in the form `Bearer fb_…` is not taken for a token at all: a request that changes something then answers `403`, and one that reads answers `401` asking for a login.

Uploading:

```bash
curl -H "Authorization: Bearer fb_YOUR_TOKEN" -F "file=@photo.jpg" https://photos.example.com/api/admin/photos
```

```json
{ "result": "accepted", "photo": { "id": "V1StGXR8_Z5j", "slug": "photo" } }
```

Deleting, for a `manage` token: `DELETE /api/admin/photos/<id>` moves a photo to the trash (off the site, kept for 30 days); `POST /api/admin/photos/<id>/restore` takes it back out; `DELETE /api/admin/photos/<id>?forever=1` deletes a photo that is in the trash for good, and answers `409` for one that is not.

The photo is processed in the background; `GET /api/admin/photos/<id>` shows `"status": "ready"` when it is done, or `"failed"` with the reason in `error` (from version 1.3.3; before that the reason was only in the list, `GET /api/admin/photos`). A duplicate or a file that is not an accepted photo answers `409` or `422` with a `message` saying why; one that is too large answers `413`, and a request with no file in it `400`. Unlike the public API, the admin API is not covered by the version promise in [UPGRADING.md](UPGRADING.md): it may change in a minor release, and the changelog will say so.

