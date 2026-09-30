import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { SignatureApiClient } from "./signatureapi/client.ts";
import type { CustomAuthentication, Envelope, Language } from "./signatureapi/types.ts";
import { SAMPLE_PLACES, SAMPLE_POSITIONS, SIGNER_KEY } from "./sample-document.ts";

export interface StartCeremonyInput {
  name: string;
  email: string;
  language: Language;
  /** Origin of the page that will <iframe> the ceremony; null forbids framing. */
  embedOrigin: string | null;
  /** Seconds before the terminal event fires (0-20). */
  redirectDelay: number;
}

export interface StartedCeremony {
  envelopeId: string;
  recipientId: string;
  ceremonyUrl: string;
  embedOrigin: string | null;
}

/**
 * The ceremony URL carries a signed token that SignatureAPI re-issues on every
 * read, each valid for 30 days. Two reads return different URLs for the same
 * ceremony, so never compare URLs to decide whether a ceremony changed.
 */
export interface CurrentCeremony {
  ceremonyUrl: string;
  envelopeStatus: string;
  signerStatus: string;
}

export interface EnvelopeSummary {
  envelopeId: string;
  status: string;
  completedAt: string | null;
  recipients: Array<{ key: string; type: string; status: string }>;
}

export interface CeremonyService {
  start(input: StartCeremonyInput): Promise<StartedCeremony>;
  current(envelopeId: string): Promise<CurrentCeremony>;
  replace(recipientId: string, embedOrigin: string | null): Promise<Pick<StartedCeremony, "ceremonyUrl" | "embedOrigin">>;
  summary(envelopeId: string): Promise<EnvelopeSummary>;
}

/** A request that is valid but cannot be served in the envelope's current state. */
export class ConflictError extends Error {
  override name = "ConflictError";
}

export interface CeremonyServiceOptions {
  client: SignatureApiClient;
  documentPdf: Uint8Array;
  /** Upload reuse window; uploads themselves expire after 24 hours. */
  uploadTtlMs?: number;
  processingTimeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
}

export function createCeremonyService(options: CeremonyServiceOptions): CeremonyService {
  const {
    client,
    documentPdf,
    uploadTtlMs = 20 * 60 * 60 * 1000,
    processingTimeoutMs = 30_000,
    pollIntervalMs = 750,
    now = Date.now,
  } = options;

  let cachedUpload: { url: string; expiresAt: number } | null = null;

  async function documentUrl(): Promise<string> {
    if (cachedUpload && cachedUpload.expiresAt > now()) return cachedUpload.url;
    const upload = await client.createUpload(documentPdf);
    cachedUpload = { url: upload.url, expiresAt: now() + uploadTtlMs };
    return upload.url;
  }

  // Custom authentication: the host app vouches for the signer, so SignatureAPI
  // returns the ceremony URL instead of emailing it. The data lands in the audit
  // log; a real integration references its own session records here.
  function customAuthentication(): CustomAuthentication[] {
    return [
      {
        type: "custom",
        provider: "SignatureAPI Web Demo",
        data: { "Demo session": randomUUID(), "Authenticated at": new Date(now()).toISOString() },
      },
    ];
  }

  async function waitUntilProcessed(envelopeId: string): Promise<Envelope> {
    const deadline = now() + processingTimeoutMs;
    for (;;) {
      const envelope = await client.getEnvelope(envelopeId);
      if (envelope.status !== "processing") return envelope;
      if (now() > deadline) throw new Error(`Envelope ${envelopeId} still processing after ${processingTimeoutMs} ms`);
      await sleep(pollIntervalMs);
    }
  }

  function signerOf(envelope: Envelope) {
    const signer = envelope.recipients.find((r) => r.key === SIGNER_KEY);
    if (!signer) throw new Error(`Envelope ${envelope.id} has no "${SIGNER_KEY}" recipient`);
    return signer;
  }

  return {
    async start(input) {
      const created = await client.createEnvelope({
        title: "Sample agreement",
        language: input.language,
        topics: ["web_demo"],
        documents: [
          { key: "agreement", format: "pdf", url: await documentUrl(), places: SAMPLE_PLACES, fixed_positions: SAMPLE_POSITIONS },
        ],
        recipients: [
          {
            type: "signer",
            key: SIGNER_KEY,
            name: input.name,
            email: input.email,
            delivery_type: "none",
            ceremony: {
              authentication: customAuthentication(),
              embeddable_in: input.embedOrigin ? [input.embedOrigin] : [],
              // Deliberately no redirect_url: embedded ceremonies ignore it.
              redirect_delay: input.redirectDelay,
            },
          },
        ],
      });

      const envelope = await waitUntilProcessed(created.id);
      if (envelope.status === "failed") throw new Error(`Envelope ${envelope.id} failed to process`);

      const signer = signerOf(envelope);
      const ceremonyUrl = signer.ceremony?.url;
      if (!ceremonyUrl) throw new Error(`Envelope ${envelope.id} returned no ceremony URL for the signer`);

      return {
        envelopeId: envelope.id,
        recipientId: signer.id,
        ceremonyUrl,
        embedOrigin: input.embedOrigin,
      };
    },

    async current(envelopeId) {
      const envelope = await client.getEnvelope(envelopeId);
      const signer = signerOf(envelope);
      const ceremonyUrl = signer.ceremony?.url;
      if (!ceremonyUrl) {
        throw new ConflictError(`No active ceremony URL (envelope ${envelope.status}, signer ${signer.status})`);
      }
      return { ceremonyUrl, envelopeStatus: envelope.status, signerStatus: signer.status };
    },

    async replace(recipientId, embedOrigin) {
      const ceremony = await client.createCeremony(recipientId, {
        authentication: customAuthentication(),
        embeddable_in: embedOrigin ? [embedOrigin] : [],
        redirect_delay: 0,
      });
      if (!ceremony.url) throw new Error(`New ceremony for ${recipientId} returned no URL`);
      return { ceremonyUrl: ceremony.url, embedOrigin };
    },

    async summary(envelopeId) {
      const envelope = await client.getEnvelope(envelopeId);
      return {
        envelopeId: envelope.id,
        status: envelope.status,
        completedAt: envelope.completed_at,
        recipients: envelope.recipients.map(({ key, type, status }) => ({ key, type, status })),
      };
    },
  };
}
