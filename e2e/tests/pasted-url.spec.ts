import { expect, test } from "@playwright/test";
import { ceremony, eventLog, openPasted, resultTitle, signAndFinish } from "../support/ceremony.ts";
import { replaceCeremony, startCeremony } from "../support/demo-server.ts";

// A ceremony URL created somewhere else and handed to the page: pasted into the
// field, or passed as ?url=.

test.describe("pasted ceremony URL", () => {
  test("adds the embedding parameters, completes, and then fails as already_completed", async ({ page, request }) => {
    const started = await startCeremony(request);

    const frame = await openPasted(page, started.ceremonyUrl);
    await expect(page.locator("#ceremony")).toHaveAttribute("src", `${started.ceremonyUrl}&embedded=true&event_delivery=message`);
    await signAndFinish(frame);

    // No envelope to check from a pasted URL, so the page says only what the ceremony said.
    await expect(resultTitle(page)).toHaveText("Ceremony completed", { timeout: 45_000 });

    await page.getByRole("button", { name: "Back to start" }).click();
    await page.getByLabel("Ceremony URL").fill(started.ceremonyUrl);
    await page.getByRole("button", { name: "Load" }).click();

    await expect(resultTitle(page)).toHaveText("Couldn’t open the document", { timeout: 30_000 });
    await expect(page.locator("#result-message")).toHaveText("This document has already been signed.");
    await expect(eventLog(page).first()).toContainText("ceremony.failed · already_completed");
  });

  test("a replaced link fails with error_type=unauthorized", async ({ page, request }) => {
    const started = await startCeremony(request);
    await replaceCeremony(request, started.recipientId);

    await openPasted(page, started.ceremonyUrl);

    await expect(resultTitle(page)).toHaveText("Couldn’t open the document", { timeout: 30_000 });
    await expect(eventLog(page)).toContainText(["ceremony.failed · unauthorized"]);
  });

  for (const [why, embedOrigin] of [["lists another origin", "https://app.demo.invalid"], ["lists none", null]] as const) {
    test(`is refused by the browser when embeddable_in ${why}`, async ({ page, request }) => {
      const started = await startCeremony(request, { embedOrigin });
      // Each engine leaves a refused frame in a different state, so look at what
      // they share: the ceremony never runs, and so never calls the API.
      const apiCalls: string[] = [];
      page.on("request", (req) => {
        if (req.url().startsWith("https://api.signatureapi.com/")) apiCalls.push(req.url());
      });

      await openPasted(page, started.ceremonyUrl);

      await page.waitForTimeout(5_000);
      expect(apiCalls).toEqual([]);
      await expect(eventLog(page)).toHaveCount(0);
      await expect(page.locator("#result")).toBeHidden();
    });
  }

  test("a URL that is not a ceremony loads as typed", async ({ page }) => {
    await page.route("https://example.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Some other page</h1>" }));
    await page.goto("/");
    await page.getByLabel("Ceremony URL").fill("example.com/page?a=1");
    await page.getByLabel("Ceremony URL").press("Enter");

    await expect(page.locator("#ceremony")).toHaveAttribute("src", "https://example.com/page?a=1");
    await expect(ceremony(page).getByRole("heading", { name: "Some other page" })).toBeVisible();
  });
});
