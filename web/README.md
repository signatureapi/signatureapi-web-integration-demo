# Page

The host page: three files, no build step, no dependencies.

| File | |
|---|---|
| [`index.html`](index.html) | The sidebar, the `<iframe>`, and the start and result panels. |
| [`app.js`](app.js) | Starts a ceremony, listens for its events, confirms the result on the server. |
| [`styles.css`](styles.css) | Layout and the design tokens below. |

The [demo server](../server/) serves this directory at its root, so the page calls the API with relative URLs (`ceremonies`, `envelopes/{id}`).

On a static host such as GitHub Pages there is no server. The page asks for `health` when it loads, and unless the demo server answers, everything marked `needs-server` stays hidden: the page then only opens ceremony URLs pasted into the field or passed as `?url=`.

## What to copy into your own page

Two functions in [`app.js`](app.js) are the integration. The rest is demo UI.

- `embeddedUrl` adds `embedded=true` and `event_delivery=message` to the ceremony URL.
- The `message` listener accepts an event only when it comes from `https://sign.signatureapi.com` **and** from the iframe's own window, then branches on `type` and `error_type`.

`confirmSignature` shows the other half: `ceremony.completed` only starts a check with the server, and "Document signed" appears once the server agrees.

## Design

The page follows signatureapi.com's visual style.

| Token | Hex | Use |
|---|---|---|
| Text | `#18181B` | Primary text, primary buttons |
| Text secondary | `#3F3F46` | Body copy |
| Text tertiary | `#686870` | Captions |
| Border | `#E0E3E9` | Card outlines |
| Background | `#F9F9F9` | Page background |
| Accent | `#2563EB` | Links, focus |

Result panels add semantic colors: success `#15803D`, danger `#B91C1C`, warning `#B45309`, each on a pale tint.

Cards and buttons use a 10-pixel corner radius.

## Fonts

| File | Use | License |
|---|---|---|
| `SignatureAPITitle-Medium.ttf` | Titles | SIL Open Font License 1.1 ([`SignatureAPITitle-LICENSE.txt`](fonts/SignatureAPITitle-LICENSE.txt)), based on Hubot Sans |
| `Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-SemiBold.ttf` | Everything else | SIL Open Font License 1.1 ([`Inter-LICENSE.txt`](fonts/Inter-LICENSE.txt)) |
