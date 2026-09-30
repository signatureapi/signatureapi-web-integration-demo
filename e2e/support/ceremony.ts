import type { FrameLocator, Locator, Page } from "@playwright/test";

export const CEREMONY_ORIGIN = "https://sign.signatureapi.com";

// The demo page, as a signer sees it.

export const ceremony = (page: Page): FrameLocator => page.frameLocator("#ceremony");
export const resultTitle = (page: Page): Locator => page.locator("#result-title");
export const eventLog = (page: Page): Locator => page.locator("#events li");

/** Opens the page with a ceremony URL passed the way a pasted link is: raw, after ?url=. */
export async function openPasted(page: Page, ceremonyUrl: string) {
  await page.goto(`/?url=${ceremonyUrl}`);
  return ceremony(page);
}

// The ceremony inside the iframe.

export async function acceptConsent(frame: FrameLocator) {
  await frame.getByRole("dialog", { name: "Consent to continue" }).getByRole("checkbox").check();
  await frame.getByRole("button", { name: "Agree and Continue" }).click();
}

export async function adoptTypedSignature(frame: FrameLocator) {
  await frame.getByRole("button", { name: "Sign here" }).click();
  const dialog = frame.getByRole("dialog", { name: "Please provide your signature" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Adopt and Sign" }).click();
}

export async function signAndFinish(frame: FrameLocator) {
  await acceptConsent(frame);
  await adoptTypedSignature(frame);
  await frame.getByRole("button", { name: "Finish" }).click();
}

export async function cancelFromToolbar(frame: FrameLocator) {
  await frame.getByRole("button", { name: "Cancel signing" }).click();
  await frame.getByRole("dialog", { name: "Cancel signing" }).getByRole("button", { name: "Yes" }).click();
}
