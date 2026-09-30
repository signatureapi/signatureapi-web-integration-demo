import type { Ceremony, CeremonySettings, CreateEnvelopeRequest, Envelope, Upload } from "./types.ts";

export class SignatureApiError extends Error {
  override name = "SignatureApiError";
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestBody = { json: unknown } | { bytes: Uint8Array; contentType: string };

export interface SignatureApiClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Thin typed wrapper over the SignatureAPI REST endpoints this demo uses. */
export class SignatureApiClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: SignatureApiClientOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  /** Uploads are temporary: they expire 24 hours after creation. */
  createUpload(pdf: Uint8Array): Promise<Upload> {
    return this.#request("POST", "/uploads", { bytes: pdf, contentType: "application/pdf" });
  }

  createEnvelope(body: CreateEnvelopeRequest): Promise<Envelope> {
    return this.#request("POST", "/envelopes", { json: body });
  }

  getEnvelope(envelopeId: string): Promise<Envelope> {
    return this.#request("GET", `/envelopes/${encodeURIComponent(envelopeId)}`);
  }

  /** Creates a new ceremony for the recipient and revokes the previous one. */
  createCeremony(recipientId: string, body: CeremonySettings): Promise<Ceremony> {
    return this.#request("POST", `/recipients/${encodeURIComponent(recipientId)}/ceremonies`, { json: body });
  }

  async #request<T>(method: string, path: string, body?: RequestBody): Promise<T> {
    const headers: Record<string, string> = { "X-API-Key": this.#apiKey, Accept: "application/json" };
    let payload: string | Uint8Array | undefined;
    if (body && "json" in body) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body.json);
    } else if (body) {
      headers["Content-Type"] = body.contentType;
      payload = body.bytes;
    }

    const response = await this.#fetch(`${this.#baseUrl}${path}`, { method, headers, body: payload });
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new SignatureApiError(response.status, `SignatureAPI ${method} ${path} returned ${response.status}: ${describeProblem(data)}`, data);
    }
    return data as T;
  }
}

/** SignatureAPI errors are RFC 9457 problem details. */
function describeProblem(data: unknown): string {
  if (data && typeof data === "object") {
    const { title, detail } = data as { title?: unknown; detail?: unknown };
    return [title, detail].filter((part): part is string => typeof part === "string").join(" - ") || "unknown error";
  }
  return "unknown error";
}
