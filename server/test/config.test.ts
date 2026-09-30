import assert from "node:assert/strict";
import { it } from "node:test";
import { ConfigError, loadConfig } from "../src/config.ts";

// A live key must be refused, and the refusal must not echo the key into logs
// or terminal output.
it("refuses a live key without echoing it", () => {
  const secret = "key_live_supersecretvalue";
  assert.throws(
    () => loadConfig({ SIGNATUREAPI_KEY: secret }),
    (err: unknown) => err instanceof ConfigError && /test-mode key/.test(err.message) && !err.message.includes(secret),
  );
});

// The default has to be the origin in the address bar, or the browser refuses the frame.
it("defaults the app origin to localhost on the configured port", () => {
  assert.equal(loadConfig({ SIGNATUREAPI_KEY: "key_test_x", PORT: "4100" }).APP_ORIGIN, "http://localhost:4100");
  assert.equal(loadConfig({ SIGNATUREAPI_KEY: "key_test_x", APP_ORIGIN: "https://demo.example.com/app" }).APP_ORIGIN, "https://demo.example.com");
});
