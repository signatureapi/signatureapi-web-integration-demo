import { expect, test, type Page } from "@playwright/test";
import { CEREMONY_ORIGIN, acceptConsent, adoptTypedSignature, ceremony, resultTitle } from "../support/ceremony.ts";
import { startFromPage } from "../support/demo-server.ts";

// A framed ceremony is third-party content. Safari and Firefox block or
// partition third-party cookies and storage by default, and Chrome does in
// Incognito. This pins down that the ceremony needs none of them.

async function ceremonyStorage(page: Page) {
  const frame = page.frames().find((f) => f.url().startsWith(`${CEREMONY_ORIGIN}/`));
  if (!frame) throw new Error("the ceremony frame is not open");
  return frame.evaluate(() => ({ localStorage: Object.keys(localStorage), sessionStorage: Object.keys(sessionStorage) }));
}

const EMPTY = { localStorage: [], sessionStorage: [] };

test("the framed ceremony needs no cookies or web storage", async ({ page }) => {
  let apiCalls = 0;
  const cookieHeaders: string[] = [];
  page.on("request", async (request) => {
    if (!request.url().startsWith("https://api.signatureapi.com/")) return;
    apiCalls++;
    const headers = await request.allHeaders();
    if (headers.cookie) cookieHeaders.push(new URL(request.url()).pathname);
  });

  await page.goto("/");
  await startFromPage(page);

  await acceptConsent(ceremony(page));
  const afterConsent = await ceremonyStorage(page);

  await adoptTypedSignature(ceremony(page));
  const beforeFinish = await ceremonyStorage(page);

  await ceremony(page).getByRole("button", { name: "Finish" }).click();
  await expect(resultTitle(page)).toHaveText("Document signed", { timeout: 45_000 });
  const cookies = (await page.context().cookies()).map((cookie) => `${cookie.name}@${cookie.domain}`);

  expect(afterConsent).toEqual(EMPTY);
  expect(beforeFinish).toEqual(EMPTY);
  expect(cookies).toEqual([]);
  expect(apiCalls, "ceremony API requests seen").toBeGreaterThan(0);
  expect(cookieHeaders, "API requests that carried a Cookie header").toEqual([]);
});
