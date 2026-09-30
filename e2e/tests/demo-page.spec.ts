import { expect, test } from "@playwright/test";
import { acceptConsent, cancelFromToolbar, ceremony, eventLog, resultTitle, signAndFinish } from "../support/ceremony.ts";
import { envelopeSummary, signerStatus, startCeremony, startFromPage } from "../support/demo-server.ts";

// The whole demo, the way a visitor uses it: the page asks the server for an
// envelope, frames the ceremony, and reports how it ended.

test.describe("Sign document", () => {
  test("signs in the iframe and shows Document signed once the server confirms", async ({ page, request }) => {
    await page.goto("/");
    const started = await startFromPage(page);

    await signAndFinish(ceremony(page));

    await expect(resultTitle(page)).toHaveText("Document signed", { timeout: 45_000 });
    await expect(eventLog(page)).toContainText(["ceremony.completed"]);
    await expect(page.locator("#ceremony")).toBeHidden();
    expect(await signerStatus(request, started.envelopeId)).toBe("completed");
  });

  test("keeps the ceremony URL out of the address bar and the page", async ({ page }) => {
    await page.goto("/");
    const started = await startFromPage(page);
    await expect(ceremony(page).getByRole("button", { name: "Agree and Continue" })).toBeVisible();

    const token = new URL(started.ceremonyUrl).searchParams.get("token")!;
    expect(token.length).toBeGreaterThan(20);
    expect(page.url()).not.toContain(token);
    expect(await page.locator("body").innerText()).not.toContain(token);
    await expect(page.getByLabel("Ceremony URL")).toHaveValue("");
  });

  test("canceling shows Signing canceled and leaves the envelope open", async ({ page, request }) => {
    await page.goto("/");
    const started = await startFromPage(page);

    await acceptConsent(ceremony(page));
    await cancelFromToolbar(ceremony(page));

    await expect(resultTitle(page)).toHaveText("Signing canceled");
    await expect(eventLog(page)).toContainText(["ceremony.canceled"]);
    expect((await envelopeSummary(request, started.envelopeId)).status).toBe("in_progress");
  });

  test("ignores a completion message that does not come from the ceremony frame", async ({ page, baseURL }) => {
    await page.goto("/");
    await startFromPage(page);
    await expect(ceremony(page).getByRole("button", { name: "Agree and Continue" })).toBeVisible();

    // Anything else running in the host page could try to fake completion.
    await page.evaluate(() => window.postMessage({ type: "ceremony.completed" }, "*"));

    await expect(eventLog(page)).toHaveText([new RegExp(`Ignored a message from ${baseURL}`)]);
    await expect(page.locator("#ceremony")).toBeVisible();
    await expect(page.locator("#result")).toBeHidden();
  });
});

test("on a static host, everything that calls the server stays hidden", async ({ page, baseURL, request }) => {
  // What GitHub Pages answers for a path that is not a file.
  await page.route("**/health", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "Not found" }));
  const serverCalls: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === baseURL && /^\/(ceremonies|envelopes|recipients)\b/.test(url.pathname)) serverCalls.push(url.pathname);
  });

  await page.goto("/");
  await expect(page.locator("#start-hint")).toContainText(`embeddable_in must include ${baseURL}`);
  await expect(page.getByRole("button", { name: "Sign document" })).toBeHidden();

  // A pasted ceremony still runs to the end, with nothing to retry against.
  const started = await startCeremony(request);
  await page.getByLabel("Ceremony URL").fill(started.ceremonyUrl);
  await page.getByRole("button", { name: "Load" }).click();
  await signAndFinish(ceremony(page));

  await expect(resultTitle(page)).toHaveText("Ceremony completed", { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Back to start" })).toBeVisible();
  await expect(page.locator("#again")).toBeHidden();
  expect(serverCalls).toEqual([]);
});
