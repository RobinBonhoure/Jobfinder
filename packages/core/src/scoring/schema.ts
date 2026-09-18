import { z } from "zod";
import { CONTRACT_VERDICTS, REMOTE_VERDICTS } from "../domain/enums";

/** Sortie structurée du scoring (PLAN §7.3). min/max sont revalidés localement par le SDK. */
export const JobScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  justification: z.string(),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  red_flags: z.array(z.string()),
  hook: z.string(),
  remote_verdict: z.enum(REMOTE_VERDICTS),
  contract_verdict: z.enum(CONTRACT_VERDICTS),
});
export type JobScore = z.infer<typeof JobScoreSchema>;

/** Verdicts qui masquent l'offre de l'Inbox (visible dans « rejetées »). */
export const HIDING_REMOTE_VERDICTS = ["hybrid_or_onsite", "remote_but_geo_incompatible"] as const;
export const HIDING_CONTRACT_VERDICTS = ["not_cdi"] as const;
