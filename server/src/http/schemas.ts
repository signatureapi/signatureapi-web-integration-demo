import { z } from "zod";
import { EmbedOrigin } from "../embed-origin.ts";
import { LANGUAGES } from "../signatureapi/types.ts";

export const StartCeremonyBody = z.object({
  name: z.string().trim().min(1).max(500).default("Demo Signer"),
  email: z.email().default("signer@example.com"),
  language: z.enum(LANGUAGES).default("en"),
  // Omitted: the server's own APP_ORIGIN, which is what the demo page relies on.
  // null: no origin may frame the ceremony.
  embedOrigin: EmbedOrigin.nullable().optional(),
  // Seconds the ceremony shows its own result page before handing back to the
  // page. 0 returns control immediately, so the page shows the outcome itself.
  redirectDelay: z.number().int().min(0).max(20).default(0),
});

export const ReplaceCeremonyBody = z.object({
  embedOrigin: EmbedOrigin.nullable().optional(),
});

export const EnvelopeParams = z.object({ envelopeId: z.guid() });
export const RecipientParams = z.object({ recipientId: z.string().regex(/^re_[A-Za-z0-9]+$/, "recipientId must look like re_...") });
