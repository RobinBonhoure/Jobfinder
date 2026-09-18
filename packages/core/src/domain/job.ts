import { z } from "zod";
import { CONTRACT_TYPES, REMOTE_POLICIES, REMOTE_SCOPES, SENIORITIES } from "./enums";

export const SalaryRange = z.object({
  min: z.number().int().nullable(),
  max: z.number().int().nullable(),
  raw: z.string().nullable(),
});
export type SalaryRange = z.infer<typeof SalaryRange>;

/** Le contrat unique entre les sources et le reste du système (PLAN §4.3). */
export const NormalizedJob = z.object({
  externalId: z.string().min(1),
  url: z.url(),
  applyUrl: z.url().nullable(),
  title: z.string().min(1),
  companyName: z.string().nullable(),
  locationRaw: z.string().nullable(),
  countryCode: z.string().length(2).nullable(),
  remotePolicy: z.enum(REMOTE_POLICIES),
  remoteScope: z.enum(REMOTE_SCOPES),
  contractType: z.enum(CONTRACT_TYPES),
  seniority: z.enum(SENIORITIES),
  salary: SalaryRange.nullable(),
  descriptionText: z.string(),
  tags: z.array(z.string()),
  publishedAt: z.date().nullable(),
  sourceUpdatedAt: z.date().nullable(),
  raw: z.unknown(),
});
export type NormalizedJob = z.infer<typeof NormalizedJob>;
