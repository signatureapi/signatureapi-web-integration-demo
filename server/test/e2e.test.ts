// End-to-end: runs the real server as a child process against SignatureAPI
// test mode, then checks the behaviour the demo page and the embedding guide
// rely on. Needs SIGNATUREAPI_KEY (a key_test_ key) in the environment or .env.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { after, before, describe, it } from "node:test";

const APP_ORIGIN = "https://app.demo.invalid";
const OTHER_ORIGIN = "http://localhost:5173";
const SERVER_DIR = new URL("..", import.meta.url);

const hasKey = Boolean(process.env.SIGNATUREAPI_KEY) || existsSync(new URL(".env", SERVER_DIR));
const skip = hasKey ? false : "set SIGNATUREAPI_KEY or create server/.env to run the e2e suite";

interface Started {
  envelopeId: string;
  recipientId: string;
  ceremonyUrl: string;
  embedOrigin: string | null;
}

describe("demo server against SignatureAPI test mode", { skip, timeout: 120_000 }, () => {
  let child: ChildProcess;
  let base: string;
  let output = "";

  before(async () => {
    child = spawn(process.execPath, ["--env-file-if-exists=.env", "src/index.ts"], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: "0", APP_ORIGIN },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    base = await new Promise<string>((resolve, reject) => {
      child.once("exit", (code) => reject(new Error(`server exited early (${code}):\n${output}`)));
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const origin = /listening on (http:\/\/localhost:\d+)/.exec(output)?.[1];
        if (origin) resolve(origin);
      });
    });
  });

  after(() => {
    child?.kill();
  });

  const post = async (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const embedded = (ceremonyUrl: string) => {
    const url = new URL(ceremonyUrl);
    url.searchParams.set("embedded", "true");
    url.searchParams.set("event_delivery", "message");
    return url;
  };

  const frameAncestors = async (url: URL) => {
    const res = await fetch(url, { redirect: "follow" });
    assert.equal(res.status, 200, `ceremony page returned ${res.status}`);
    return /frame-ancestors ([^;]+)/.exec(res.headers.get("content-security-policy") ?? "")?.[1]?.trim();
  };

  let framed: Started;

  it("serves the demo page", async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    assert.match(await res.text(), /<iframe/);
  });

  it("issues a custom-auth ceremony URL that only its own page may frame", async () => {
    const res = await post("/ceremonies", { language: "es" });
    assert.equal(res.status, 201, await res.clone().text());
    framed = (await res.json()) as Started;
    assert.equal(new URL(framed.ceremonyUrl).origin, "https://sign.signatureapi.com");
    assert.match(new URL(framed.ceremonyUrl).pathname, /^\/es\//);
    assert.match(framed.recipientId, /^re_/);
    assert.equal(framed.embedOrigin, APP_ORIGIN);
    assert.equal(await frameAncestors(embedded(framed.ceremonyUrl)), APP_ORIGIN);
  });

  it("frames from an http localhost origin when asked, for local development", async () => {
    const res = await post("/ceremonies", { embedOrigin: `${OTHER_ORIGIN}/some/path` });
    assert.equal(res.status, 201, await res.clone().text());
    const started = (await res.json()) as Started;
    assert.equal(started.embedOrigin, OTHER_ORIGIN);
    assert.equal(await frameAncestors(embedded(started.ceremonyUrl)), OTHER_ORIGIN);
  });

  it("forbids framing when the embed origin is null", async () => {
    const res = await post("/ceremonies", { embedOrigin: null });
    assert.equal(res.status, 201, await res.clone().text());
    const ancestors = await frameAncestors(embedded(((await res.json()) as Started).ceremonyUrl));
    // SignatureAPI currently sends the bare word `none`, which browsers parse as a
    // hostname nobody has, so framing is still refused. Accept it and the proper keyword.
    assert.ok(ancestors === "'none'" || ancestors === "none", `unexpected frame-ancestors: ${ancestors}`);
  });

  it("resumes the same ceremony from the server, so the page never stores the URL", async () => {
    const res = await fetch(`${base}/envelopes/${framed.envelopeId}/ceremony-url`);
    assert.equal(res.status, 200);
    const current = (await res.json()) as { ceremonyUrl: string; envelopeStatus: string };
    assert.equal(current.envelopeStatus, "in_progress");
    // The token is re-issued on every read, so the URL differs but still opens.
    assert.notEqual(current.ceremonyUrl, framed.ceremonyUrl);
    assert.equal(await frameAncestors(embedded(current.ceremonyUrl)), APP_ORIGIN);
  });

  it("replaces the ceremony and keeps the embed origin of the new one", async () => {
    const res = await post(`/recipients/${framed.recipientId}/ceremony`, {});
    assert.equal(res.status, 201);
    const replaced = (await res.json()) as { ceremonyUrl: string };
    assert.equal(await frameAncestors(embedded(replaced.ceremonyUrl)), APP_ORIGIN);
    // Whether the previous URL is refused is only visible once the ceremony app runs:
    // the page itself still loads with 200. The browser suite covers that case.
  });

  it("reports envelope status from the server side", async () => {
    const res = await fetch(`${base}/envelopes/${framed.envelopeId}`);
    const summary = (await res.json()) as { status: string; recipients: Array<{ key: string; status: string }> };
    assert.equal(summary.status, "in_progress");
    const signer = summary.recipients.find((r) => r.key === "signer");
    assert.ok(signer, "summary has no signer");
    assert.notEqual(signer.status, "completed");
  });

  it("rejects bad input before calling SignatureAPI", async () => {
    assert.equal((await post("/ceremonies", { embedOrigin: "http://app.demo.invalid" })).status, 400);
    assert.equal((await post("/ceremonies", { embedOrigin: "*" })).status, 400);
    assert.equal((await post("/ceremonies", { language: "xx" })).status, 400);
    assert.equal((await fetch(`${base}/envelopes/not-a-uuid`)).status, 400);
    assert.equal((await post("/recipients/nope/ceremony", {})).status, 400);
  });

  it("does not serve files outside the page's directory", async () => {
    assert.equal((await fetch(`${base}/.env`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/server/.env`)).status, 404);
  });

  it("never writes a ceremony URL to its logs", () => {
    assert.ok(output.includes("ready"), "expected the server to log envelope creation");
    assert.ok(!output.includes("token="), "server output contains a ceremony token");
  });
});
