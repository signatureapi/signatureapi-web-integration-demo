import express, { type ErrorRequestHandler, type Express } from "express";
import { ZodError } from "zod";
import { ConflictError, type CeremonyService } from "../ceremonies.ts";
import { SignatureApiError } from "../signatureapi/client.ts";
import { EnvelopeParams, RecipientParams, ReplaceCeremonyBody, StartCeremonyBody } from "./schemas.ts";

export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

export interface AppOptions {
  /** Origin the page is opened from: the default for a ceremony's embeddable_in. */
  appOrigin: string;
  /** Directory of the demo page, served at the root. */
  webRoot: string;
  logger?: Logger;
}

/**
 * The demo page and the HTTP API it calls.
 *
 * Ceremony URLs are bearer credentials: anyone holding one can sign. They are
 * returned to the page but never logged. This demo has no user authentication;
 * a real backend must check that the caller is the signer before returning one.
 */
export function createApp(service: CeremonyService, options: AppOptions): Express {
  const { appOrigin, webRoot, logger = console } = options;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(webRoot));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Creates a one-signer test envelope and returns the signer's ceremony URL.
  // The ceremony can be framed by this server's own page and by nothing else,
  // unless the caller names another origin.
  app.post("/ceremonies", async (req, res) => {
    const { embedOrigin = appOrigin, ...input } = StartCeremonyBody.parse(req.body ?? {});
    const started = await service.start({ ...input, embedOrigin });
    logger.info(`envelope ${started.envelopeId} ready (language=${input.language}, embedOrigin=${embedOrigin ?? "none"})`);
    res.status(201).json(started);
  });

  // Returns a URL for the signer's current ceremony without replacing it, so a
  // page reloaded mid-ceremony can resume without storing the URL in the browser.
  // SignatureAPI re-issues the token on every read: expect a different URL for
  // the same ceremony each time.
  app.get("/envelopes/:envelopeId/ceremony-url", async (req, res) => {
    const { envelopeId } = EnvelopeParams.parse(req.params);
    res.json(await service.current(envelopeId));
  });

  // Server-side truth. A ceremony.completed event in the page is a UI signal,
  // not proof: confirm here (or with a webhook) before acting on it.
  app.get("/envelopes/:envelopeId", async (req, res) => {
    const { envelopeId } = EnvelopeParams.parse(req.params);
    res.json(await service.summary(envelopeId));
  });

  // Replaces the signer's ceremony. The previous URL stops working at once.
  app.post("/recipients/:recipientId/ceremony", async (req, res) => {
    const { recipientId } = RecipientParams.parse(req.params);
    const { embedOrigin = appOrigin } = ReplaceCeremonyBody.parse(req.body ?? {});
    const replaced = await service.replace(recipientId, embedOrigin);
    logger.info(`new ceremony for recipient ${recipientId} (embedOrigin=${embedOrigin ?? "none"})`);
    res.status(201).json(replaced);
  });

  app.use(errorHandler(logger));
  return app;
}

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid request", issues: err.issues.map(({ path, message }) => ({ path: path.join("."), message })) });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof SignatureApiError) {
      logger.error(err.message);
      // A missing envelope or recipient is the caller's problem; anything else is ours.
      res.status(err.status === 404 ? 404 : 502).json({ error: err.message });
      return;
    }
    logger.error(err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Internal error" });
  };
}
