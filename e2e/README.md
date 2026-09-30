# Browser tests

Real test-mode ceremonies, framed by the [demo page](../web/) and driven by [Playwright](https://playwright.dev) in the three desktop engines:

| Project | Engine | Stands in for |
|---|---|---|
| `chromium` | Chromium | Chrome, Edge |
| `webkit` | WebKit | Safari |
| `firefox` | Gecko | Firefox |

## Run

Needs the demo server's key in `../server/.env` (see [server/README.md](../server/README.md)). The suite starts its own server on port 3999.

```bash
npm install
npm run install-browsers
npm test
```

`npm run typecheck` checks the TypeScript.

## What's covered

**[`demo-page.spec.ts`](tests/demo-page.spec.ts):** the demo as a visitor uses it, from **Sign document** on:
- signing ends on "Document signed", after the server confirms the envelope;
- the ceremony URL never appears in the address bar or on the page;
- canceling ends on "Signing canceled" and leaves the envelope open;
- a `ceremony.completed` message posted by the host page itself is ignored;
- on a static host, **Sign document** is hidden, a pasted ceremony still completes, and the page never calls the server.

**[`pasted-url.spec.ts`](tests/pasted-url.spec.ts):** a ceremony URL handed to the page with `?url=` or the field:
- the page adds `embedded=true` and `event_delivery=message`, and completion arrives by `postMessage`;
- a completed link fails with `already_completed`; a replaced one with `unauthorized`;
- the browser refuses the frame when `embeddable_in` lists another origin, or none;
- a URL that is not a ceremony loads unchanged.

**[`storage.spec.ts`](tests/storage.spec.ts):** no cookies, no `localStorage`, no `sessionStorage`, and no `Cookie` header on API calls from the framed ceremony.

## How outcomes are detected

The tests read the page: the result panel and the event list in the sidebar. Both are filled only by the page's `message` listener, after its origin and source checks, so a passing test means a real `postMessage` from the ceremony frame got through.

A refused frame looks different in every engine (an error page, a blank document, or the ceremony's URL with nothing in it). The tests check what the three share: the ceremony never runs, so it never calls `api.signatureapi.com` and never posts an event.
