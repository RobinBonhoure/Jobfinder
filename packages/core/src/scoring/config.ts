import { env } from "../env";

/** Toute modification du prompt crée un nouveau fichier et incrémente cette version (invalide le cache). */
export const PROMPT_VERSION = "scoring.v1";
export const EXTRACTION_PROMPT_VERSION = "capture.v1";
export const OUTREACH_PROMPT_VERSION = "outreach.v1";

export const scoringModel = () => env().SCORING_MODEL;
export const outreachModel = () => env().OUTREACH_MODEL;

/** Au-delà, la description est journalisée comme anormale (mais envoyée quand même). */
export const LONG_DESCRIPTION_CHARS = 40_000;
