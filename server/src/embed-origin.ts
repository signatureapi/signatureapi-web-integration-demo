import { z } from "zod";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MESSAGE = "must be an https origin, or an http origin on localhost";

/**
 * An origin allowed to frame the ceremony, reduced from a URL:
 * "https://app.example.com/x" -> "https://app.example.com".
 * Plain http is accepted only for this machine, for local development.
 */
export const EmbedOrigin = z
  .url({ protocol: /^https?$/, error: MESSAGE, abort: true })
  .refine((value) => value.startsWith("https:") || LOOPBACK_HOSTS.has(new URL(value).hostname), { error: MESSAGE })
  .transform((value) => new URL(value).origin);
