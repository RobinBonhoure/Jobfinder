import { z } from "zod";
import type { RemoteScope, Seniority } from "../domain/enums";
import { buildJob } from "../normalize/build";
import { contractFromLabel } from "../normalize/contract";
import { salaryFromNumbers } from "../normalize/salary";
import { fold, htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({
  geo: z.string().default("france"),
  industry: z.string().default("engineering"),
  tag: z.string().optional(),
  count: z.number().int().min(1).max(100).default(50),
});

const JobicyJob = z.looseObject({
  id: z.number(),
  url: z.string(),
  jobTitle: z.string(),
  companyName: z.string().nullish(),
  jobIndustry: z.array(z.string()).nullish(),
  jobType: z.array(z.string()).nullish(),
  jobGeo: z.string().nullish(),
  jobLevel: z.string().nullish(),
  jobDescription: z.string().nullish(),
  jobExcerpt: z.string().nullish(),
  pubDate: z.string().nullish(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});

function scopeFromGeo(geo: string | null | undefined): RemoteScope {
  const g = fold(geo ?? "");
  if (!g) return "unknown";
  if (/\bfrance\b/.test(g)) return "france";
  if (/\b(europe|emea|eu)\b/.test(g)) return "europe";
  if (/\b(anywhere|worldwide)\b/.test(g)) return "worldwide";
  return "other";
}

const LEVEL: Record<string, Seniority> = {
  senior: "senior",
  midweight: "mid",
  junior: "junior",
  lead: "lead",
};

export const jobicy = defineSource({
  kind: "jobicy",
  configSchema: Config,
  // La doc demande « pas plus d'une fois par heure » ; on reste très en dessous.
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 360,
  completeListing: false,

  async fetch({ config, http, signal }) {
    const params = new URLSearchParams({
      count: String(config.count),
      geo: config.geo,
      industry: config.industry,
    });
    if (config.tag) params.set("tag", config.tag);
    const data = await http.getJson<{ jobs?: unknown[] }>(`https://jobicy.com/api/v2/remote-jobs?${params}`, {
      signal,
    });
    return { items: data.jobs ?? [], nextCursor: null, complete: true };
  },

  externalId: (raw) => String(JobicyJob.parse(raw).id),

  normalize(raw) {
    const j = JobicyJob.parse(raw);
    return buildJob({
      externalId: String(j.id),
      // CGU Jobicy : conserver l'URL canonique Jobicy.
      url: j.url,
      applyUrl: j.url,
      title: j.jobTitle,
      companyName: j.companyName ?? null,
      locationRaw: j.jobGeo ? `Remote — ${j.jobGeo}` : "Remote",
      descriptionText: htmlToText(j.jobDescription ?? j.jobExcerpt ?? ""),
      remotePolicy: "full_remote",
      remoteScope: scopeFromGeo(j.jobGeo),
      contractType: contractFromLabel(j.jobType?.join(" ")),
      seniority: LEVEL[(j.jobLevel ?? "").toLowerCase()] ?? null,
      salary: salaryFromNumbers(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod),
      tags: [...(j.jobIndustry ?? []), "via Jobicy"],
      publishedAt: j.pubDate,
      raw,
    });
  },
});
