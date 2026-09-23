import { env } from "../env";

/** Toute modification du prompt crée un nouveau fichier et incrémente cette version (invalide le cache). */
export const PROMPT_VERSION = "scoring.v3";
export const EXTRACTION_PROMPT_VERSION = "capture.v1";
export const OUTREACH_PROMPT_VERSION = "outreach.v1";
export const COVER_LETTER_PROMPT_VERSION = "cover-letter.v1";

export const scoringModel = () => env().SCORING_MODEL;
export const outreachModel = () => env().OUTREACH_MODEL;

/**
 * Rédaction (lettre, candidature spontanée) : Sonnet 5 réfléchit par défaut (thinking adaptatif)
 * et cette réflexion compte dans max_tokens — à 2 048, elle consommait tout avant le texte.
 * 16 000 = plafond conseillé sans streaming ; l'effort `medium` suffit pour rédiger.
 */
export const WRITING_REQUEST = { max_tokens: 16_000, effort: "medium" } as const;

/** Au-delà, la description est journalisée comme anormale (mais envoyée quand même). */
export const LONG_DESCRIPTION_CHARS = 40_000;
