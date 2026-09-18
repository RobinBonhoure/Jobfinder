import { z } from "zod";
import type { ContractType, RemotePolicy, Seniority } from "../domain/enums";
import { buildJob } from "../normalize/build";
import { salaryFromNumbers } from "../normalize/salary";
import { htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({ company: z.string().regex(/^[a-z0-9-]+$/i, "sous-domaine Recruitee attendu") });

const Offer = z.looseObject({
  id: z.number(),
  slug: z.string().nullish(),
  title: z.string(),
  status: z.string().nullish(),
  company_name: z.string().nullish(),
  description: z.string().nullish(),
  requirements: z.string().nullish(),
  location: z.string().nullish(),
  city: z.string().nullish(),
  country_code: z.string().nullish(),
  remote: z.boolean().nullish(),
  hybrid: z.boolean().nullish(),
  on_site: z.boolean().nullish(),
  employment_type_code: z.string().nullish(),
  experience_code: z.string().nullish(),
  published_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  careers_url: z.string(),
  careers_apply_url: z.string().nullish(),
  department: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  salary: z
    .looseObject({
      min: z.coerce.number().nullish(),
      max: z.coerce.number().nullish(),
      currency: z.string().nullish(),
      period: z.string().nullish(),
    })
    .nullish(),
});

const EMPLOYMENT: Record<string, ContractType> = {
  fulltime_permanent: "cdi",
  parttime_permanent: "cdi",
  fulltime_fixed_term: "cdd",
  parttime_fixed_term: "cdd",
  fulltime_temporary: "cdd",
  internship: "internship",
  traineeship: "internship",
  apprenticeship: "apprenticeship",
  freelance: "freelance",
  contract: "freelance",
};
const EXPERIENCE: Record<string, Seniority> = {
  student: "junior",
  entry_level: "junior",
  mid_level: "mid",
  experienced: "senior",
  manager: "lead",
  executive: "lead",
};

/** Recruitee publie des dates au format « 2026-09-16 23:31:24 UTC ». */
const recruiteeDate = (s: string | null | undefined) => (s ? s.replace(" UTC", "Z").replace(" ", "T") : null);

export const recruitee = defineSource({
  kind: "recruitee",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 180,
  completeListing: true,

  async fetch({ config, http, signal }) {
    const data = await http.getJson<{ offers?: Array<{ status?: string }> }>(
      `https://${config.company}.recruitee.com/api/offers/`,
      { signal },
    );
    const items = (data.offers ?? []).filter((o) => !o.status || o.status === "published");
    return { items, nextCursor: null, complete: true };
  },

  externalId: (raw) => String(Offer.parse(raw).id),

  normalize(raw, ctx) {
    const o = Offer.parse(raw);
    let remotePolicy: RemotePolicy | null = null;
    if (o.remote && !o.hybrid && !o.on_site) remotePolicy = "full_remote";
    else if (o.hybrid) remotePolicy = "hybrid";
    else if (o.on_site && !o.remote) remotePolicy = "onsite";
    return buildJob({
      externalId: String(o.id),
      url: o.careers_url,
      applyUrl: o.careers_apply_url ?? o.careers_url,
      title: o.title,
      companyName: o.company_name ?? ctx.companyName,
      locationRaw: o.location ?? o.city ?? null,
      country: o.country_code ?? null,
      descriptionText: [htmlToText(o.description ?? ""), htmlToText(o.requirements ?? "")]
        .filter(Boolean)
        .join("\n\n"),
      remotePolicy,
      contractType: EMPLOYMENT[o.employment_type_code ?? ""] ?? null,
      seniority: EXPERIENCE[o.experience_code ?? ""] ?? null,
      salary: salaryFromNumbers(o.salary?.min, o.salary?.max, o.salary?.currency, o.salary?.period),
      tags: [o.department, ...(o.tags ?? [])].filter((t): t is string => Boolean(t)),
      publishedAt: recruiteeDate(o.published_at),
      sourceUpdatedAt: recruiteeDate(o.updated_at),
      raw,
    });
  },
});
