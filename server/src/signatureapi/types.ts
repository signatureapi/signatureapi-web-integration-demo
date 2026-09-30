// The subset of the SignatureAPI resource shapes this server reads or writes.
// Full reference: https://signatureapi.com/docs/api

export const LANGUAGES = ["en", "es", "fr", "it", "pt", "de", "zh", "hu", "nl"] as const;
export type Language = (typeof LANGUAGES)[number];

export type EnvelopeStatus = "draft" | "processing" | "in_progress" | "completed" | "failed" | "canceled";

export interface CustomAuthentication {
  type: "custom";
  /** Shown in the audit log: "<name> has been authenticated by <provider>". */
  provider: string;
  /** Key-value pairs linking the ceremony to your own authentication records. */
  data: Record<string, string>;
}

export interface CeremonySettings {
  authentication: CustomAuthentication[];
  /** Origins allowed to <iframe> the ceremony (CSP frame-ancestors). Empty = no framing. */
  embeddable_in?: string[];
  /** Ignored by embedded ceremonies. */
  redirect_url?: string | null;
  /** Seconds before the terminal event fires, 0-20. */
  redirect_delay?: number;
}

export interface Ceremony extends CeremonySettings {
  /** Bearer credential for the signing session. Null when SignatureAPI delivers it by email. */
  url: string | null;
}

export type Place =
  | { key: string; type: "signature"; recipient_key: string; height?: number }
  | { key: string; type: "checkbox"; recipient_key: string; requirement?: "required" | "optional"; height?: number }
  | { key: string; type: "text_input"; recipient_key: string; width?: number; prompt?: string; capture_as?: string }
  | { key: string; type: "recipient_completed_date"; recipient_key: string };

export interface FixedPosition {
  place_key: string;
  page: number;
  /** Points from the top edge of the page to the bottom-left corner of the place. */
  top: number;
  left: number;
}

export interface CreateEnvelopeRequest {
  title: string;
  language: Language;
  topics?: string[];
  documents: Array<{
    key: string;
    format: "pdf";
    url: string;
    places: Place[];
    fixed_positions: FixedPosition[];
  }>;
  recipients: Array<{
    type: "signer";
    key: string;
    name: string;
    email: string;
    delivery_type: "email" | "none";
    ceremony: CeremonySettings;
  }>;
}

export interface Recipient {
  id: string;
  key: string;
  type: string;
  status: string;
  ceremony?: Ceremony;
}

export interface Envelope {
  id: string;
  status: EnvelopeStatus;
  completed_at: string | null;
  recipients: Recipient[];
}

export interface Upload {
  url: string;
}
