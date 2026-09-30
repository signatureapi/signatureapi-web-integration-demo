import type { FixedPosition, Place } from "./signatureapi/types.ts";

/** Recipient key of the single signer in every demo envelope. */
export const SIGNER_KEY = "signer";

/** US Letter height in points; PDF text coordinates start at the bottom. */
export const PAGE_HEIGHT = 792;

/** A one-signature sample: the simplest document worth signing. */
export const SAMPLE_PLACES: Place[] = [
  { key: "signature", type: "signature", recipient_key: SIGNER_KEY, height: 50 },
  { key: "signed_on", type: "recipient_completed_date", recipient_key: SIGNER_KEY },
];

/** Points from the top-left of page 1 to each place's bottom-left corner. */
export const SAMPLE_POSITIONS: FixedPosition[] = [
  { place_key: "signature", page: 1, top: 470, left: 160 },
  { place_key: "signed_on", page: 1, top: 510, left: 160 },
];

/** Printed text, aligned with SAMPLE_POSITIONS. Used by scripts/make-sample-pdf.ts. */
export const SAMPLE_TEXT: Array<{ left: number; top: number; size: number; value: string }> = [
  { left: 72, top: 80, size: 20, value: "Sample Agreement" },
  { left: 72, top: 110, size: 10, value: "Synthetic document for the SignatureAPI web embedding demo." },
  { left: 72, top: 124, size: 10, value: "Signed in test mode only. It carries no legal effect." },
  { left: 72, top: 170, size: 11, value: "1. The signer confirms they have read this sample agreement." },
  { left: 72, top: 190, size: 11, value: "2. The signer agrees to sign it electronically inside a web page." },
  { left: 72, top: 210, size: 11, value: "3. Nothing in this document creates any obligation for anyone." },
  { left: 72, top: 460, size: 11, value: "Signature:" },
  { left: 72, top: 506, size: 11, value: "Date:" },
];
