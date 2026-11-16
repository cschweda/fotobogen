# Webhooks

A webhook tells another program when something happens on your site, by sending a small JSON message to an address you choose. Add them under **Admin, Webhooks**.

## Contents

- [Events](#events)
- [The message](#the-message)
- [Checking the signature](#checking-the-signature)
- [Delivery](#delivery)
- [Which addresses can be called](#which-addresses-can-be-called)

## Events

| Event | When |
|---|---|
| `photo.uploaded` | A photo has been accepted through the upload page or the API. It is not processed yet and may not be public. Sample photos downloaded by Fotobogen do not send this. |
| `photo.published` | A photo has become visible to visitors: it finished processing as a public photo, was made public, or its scheduled time arrived (checked once a minute). |
| `photo.deleted` | A photo was deleted from the library. **Remove sample photos** does not send this. |

**Send a test** on the Webhooks page sends an event called `test`.

## The message

A `POST` with a JSON body:

```json
{
  "event": "photo.published",
  "sentAt": "2026-11-15T16:40:12.000Z",
  "site": "Kodachrome Days",
  "photo": {
    "slug": "crossing",
    "title": "Crossing",
    "path": "/photo/crossing",
    "image": "/media/bxIjUHae-4Jn-medium-60fd4c19.webp"
  }
}
```

`path` and `image` are relative to your site's address. `image` is the 1280 px copy (smaller when the photo itself is smaller), or `null` when there is none: for a deleted photo, and for `photo.uploaded`, which is sent before any copy has been made. For a `test`, `photo` is `null`. For more about a photo, read it from the [public API](API.md): `GET /api/photos/<slug>`.

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Fotobogen-Event` | The event name |
| `X-Fotobogen-Signature` | `sha256=` followed by a signature of the body (below) |
| `User-Agent` | `fotobogen-webhook` |

## Checking the signature

When you add a webhook, Fotobogen shows its secret once. Every message is signed with it: the signature is the HMAC-SHA256 of the exact bytes of the body, in hexadecimal. Check it before trusting a message, so that nobody else can pretend to be your site. The signature proves who wrote a message, not when: someone who captured one could send it again. `sentAt` is inside the signed body, so refuse a message whose `sentAt` is more than a few minutes old, and give the webhook an `https` address so messages cannot be read on the way.

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

function cameFromMySite(rawBody, signatureHeader, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  const given = Buffer.from(signatureHeader ?? '')
  return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected))
}
```

Use the body exactly as it arrived, before any JSON parsing.

## Delivery

- Your receiver has ten seconds to answer. Any `2xx` answer counts as delivered; its body is ignored.
- If it does not answer, or answers with anything else, Fotobogen tries again after 5 seconds and again after 30. Then it gives up on that message.
- Retries are held in memory. A message waiting to be retried is lost if Fotobogen restarts.
- Redirects are not followed.
- The Webhooks page shows how each webhook's last message went.
- A site can have up to ten webhooks.

Because a message can arrive twice (a slow answer followed by a retry), make your receiver safe to call twice with the same message.

## Which addresses can be called

Only addresses on the public internet, by default. A webhook pointed at this machine or a private network (`localhost`, `192.168.…`, `10.…`, and so on) is refused, both when it is added and each time it would be called. That stops a webhook being used to reach things that are not meant to be reachable from outside. The check is made on the address the connection is actually made to, so a name that is pointed somewhere else later does not get round it, and every way of writing a private address counts, including IPv6 forms that wrap an IPv4 one.

If you do want to call something on your own network, such as an automation tool on the same server, set `WEBHOOKS_ALLOW_PRIVATE=1` in `.env` and restart.
