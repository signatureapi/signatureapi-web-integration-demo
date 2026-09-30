# Embedding SignatureAPI in a web page

How to show a SignatureAPI signing ceremony inside your own web page, and what to expect from it. The ceremony behavior described here is exercised by the tests in this repository against SignatureAPI test mode, in Chromium, WebKit and Firefox. Options that come from the API reference, rather than from the tests, link to it.

For the API reference, see the [SignatureAPI docs](https://signatureapi.com/docs), in particular [Embed signing in a web app](https://signatureapi.com/docs/api/guides/how-to/embed-web), [Embedding in a web application](https://signatureapi.com/docs/embedded/web-app) and [Ceremony events](https://signatureapi.com/docs/embedded/ceremony-events).

## The pattern

1. **Your backend creates the ceremony.** Give the signer a ceremony with [custom authentication](https://signatureapi.com/docs/api/resources/ceremonies/authentication/custom), and list your page's origin in `embeddable_in`. SignatureAPI returns the ceremony URL to you instead of emailing it. Never call the SignatureAPI REST API from the browser: an API key in page code is a leaked key.
2. **The page loads the ceremony in an `<iframe>`**, with two query parameters added:

   ```
   <ceremony url>&embedded=true&event_delivery=message
   ```

3. **The ceremony reports how it ended with `postMessage`.** The page checks who sent the message, then closes the iframe.
4. **The backend confirms the result**, with a webhook or by reading the envelope. The event in the page is a signal for the UI, not proof that the envelope is complete.

```html
<iframe id="ceremony" title="Signing ceremony"></iframe>
```

```js
const CEREMONY_ORIGIN = 'https://sign.signatureapi.com';
const frame = document.getElementById('ceremony');

frame.src = ceremonyUrl + '&embedded=true&event_delivery=message';

window.addEventListener('message', (event) => {
  if (event.origin !== CEREMONY_ORIGIN || event.source !== frame.contentWindow) return;
  // event.data.type is the event type, e.g. "ceremony.completed"
});
```

See [`web/app.js`](../web/app.js) for the full listener and [`server/src/ceremonies.ts`](../server/src/ceremonies.ts) for the envelope.

## Who may frame the ceremony

The ceremony sends a Content Security Policy whose `frame-ancestors` is built from `embeddable_in`. The browser enforces it: a page on any other origin gets an empty frame, and the ceremony never runs.

- **List the exact origin**: scheme, host and port, with no path and no trailing slash. `http://localhost:3000` and `http://127.0.0.1:3000` are different origins.
- **`http://localhost:<port>` works** for local development. Everything else should be https.
- **An empty `embeddable_in` forbids framing** altogether.
- **Set it on your server, from configuration.** Don't take it from the request.
- **`embedded=true` is required.** Without it the ceremony does not send the framing policy your origin needs ([API reference](https://signatureapi.com/docs/embedded/web-app#troubleshooting)).

A refused frame produces no event, because the ceremony never loads. The page sees nothing; the browser console shows the `frame-ancestors` violation. If users report a blank frame, check the origin first.

## Events

The ceremony posts an object with a `type`. A failure adds `error_type` and `error_message`.

| `type` | Meaning |
|---|---|
| `ceremony.completed` | The signer finished. |
| `ceremony.canceled` | The signer canceled inside the ceremony. |
| `ceremony.declined` | An approver rejected the document ([API reference](https://signatureapi.com/docs/embedded/ceremony-events)). |
| `ceremony.failed` | The ceremony could not be used. |

| `error_type` | When it happens |
|---|---|
| `unauthorized` | The link is no longer valid, for example because a newer ceremony replaced it. |
| `already_completed` | The signer already completed this ceremony. |
| `not_available`, `invalid_link`, `unexpected_error` | See the [API reference](https://signatureapi.com/docs/embedded/ceremony-events#error-types). |

Branch on `error_type`, and treat a value you don't know as a generic failure. `error_message` is English text for your logs, not copy for signers.

### Check the sender

The ceremony posts with target origin `"*"`, and `window.postMessage` is open to every script and frame on your page. Accept a message only when **both** are true:

- `event.origin === "https://sign.signatureapi.com"`
- `event.source === iframe.contentWindow`

Without the check, any script on the page can post `{ type: "ceremony.completed" }` and your UI will believe it. The demo page lists the messages it ignores in its sidebar, and [`demo-page.spec.ts`](../e2e/tests/demo-page.spec.ts) forges one to show the check working.

The check protects your UI. It is still not proof: confirm on the server.

## Showing your own result screen

Set `redirect_delay` to `0` when you create the ceremony. The ceremony then hands control back immediately after the signer finishes, instead of showing its own result page for a few seconds first (3 by default, up to 20; [API reference](https://signatureapi.com/docs/embedded/ceremony-events)).

You don't need a `redirect_url`. Embedded ceremonies ignore it, so leave it unset. Every ceremony this repo creates has none.

When the event arrives, remove the iframe or point it at `about:blank`. The ceremony is finished and has nothing more to show.

## Cookies and web storage

A framed ceremony is third-party content. Safari and Firefox block or partition third-party cookies and storage by default, so this matters more here than it does for a standalone link.

The ceremony needs **no cookies and no web storage**. It sets no cookies, writes nothing to `localStorage` or `sessionStorage`, and sends no `Cookie` header with its API calls. Default browser privacy settings don't get in its way. See [`storage.spec.ts`](../e2e/tests/storage.spec.ts).

If your page has its own Content Security Policy, allow the ceremony in `frame-src`: `https://sign.signatureapi.com`.

## Link lifetime and resuming

- A ceremony URL stays valid until the signer completes it or a newer ceremony replaces it, and for 30 days at most ([API reference](https://signatureapi.com/docs/api/resources/ceremonies/ceremony-url)).
- It is a bearer credential: anyone holding it can sign. Don't log it, don't put it in your page's address bar, and don't keep it in `localStorage`.
- To resume after a reload, **ask your backend for the current URL** (read the envelope) and load it again. SignatureAPI issues a fresh URL for the same ceremony on every read, so the URL you get back differs from the first one but opens the same ceremony.
- Creating a new ceremony for the signer revokes the previous URL. Opening the old one ends with `ceremony.failed` and `error_type=unauthorized`.
- Opening a URL after the signer completed ends with `ceremony.failed` and `error_type=already_completed`.

A revoked URL still loads with HTTP 200. The ceremony page reports the problem once it runs, through the event above, so don't try to check a URL with a plain HTTP request.

## Automated testing

- **Drive the ceremony with real input.** To stop email link scanners from completing ceremonies, the ceremony arms completion only after it has seen input a person produces, such as pointer movement, a scroll or a key press. Playwright's clicks count. Clicks dispatched from JavaScript don't, and **Finish** then asks for a second confirmation. If that dialog shows up in a test, the test is not behaving like a signer.
- **Assert on what your page does with the event**, not on the ceremony's console output.
- **A refused frame looks different in every browser**: an error page in Chromium, a blank document in Firefox, the ceremony's URL with nothing in it in WebKit. To test a refusal, check that no event arrived and that the ceremony made no API calls.
- **Don't look inside a refused frame.** In Firefox, a Playwright locator that reaches into one waits until the whole test times out instead of failing.

## Test mode

Everything in this repository uses a test API key (`key_test_…`). Test envelopes behave like live ones but are marked "null and void", are not legally binding, and send no emails, so you can run them as often as you like. Create a test key in the [dashboard](https://dashboard.signatureapi.com/settings/api-keys), or run `npx --yes signatureapi init` in `server/`.
