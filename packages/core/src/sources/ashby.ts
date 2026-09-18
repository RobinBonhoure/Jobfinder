import { z } from "zod";
import type { ContractType, RemotePolicy } from "../domain/enums";
import { buildJob } from "../normalize/build";
import { htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({ name: z.string().min(1) });

const Address = z
  .looseObject({
    postalAddress: z
      .looseObject({ addressCountry: z.string().nullish(), addressLocality: z.string().nullish() })
      .nullish(),
  })
  .nullish();

const AshbyJob = z.looseObject({
  id: z.string(),
  title: z.string(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  employmentType: z.string().nullish(),
  location: z.string().nullish(),
  secondaryLocations: z.array(z.looseObject({ location: z.string().nullish() })).nullish(),
  publishedAt: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  address: Address,
  jobUrl: z.string(),
  applyUrl: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  compensation: z.looseObject({ scrapeableCompensationSalarySummary: z.string().nullish() }).nullish(),
});

const WORKPLACE: Record<string, RemotePolicy> = { remote: "full_remote", hybrid: "hybrid", onsite: "onsite" };
// « Contract » n'est pas mappé : certaines entreprises (Doctolib) l'emploient pour des CDI.
const EMPLOYMENT: Record<string, ContractType> = {
  intern: "internship",
  temporary: "cdd",
};

export const ashby = defineSource({
  kind: "ashby",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 180,
  completeListing: true,
  hostIntervals: { "api.ashbyhq.com": 500 },

  async fetch({ config, http, signal }) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(config.name)}?includeCompensation=true`;
    const data = await http.getJson<{ jobs?: Array<{ isListed?: boolean }> }>(url, { signal });
    const items = (data.jobs ?? []).filter((j) => j.isListed !== false);
    return { items, nextCursor: null, complete: true };
  },

  externalId: (raw) => AshbyJob.parse(raw).id,

  normalize(raw, ctx) {
    const j = AshbyJob.parse(raw);
    const workplace = (j.workplaceType ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const remotePolicy = WORKPLACE[workplace] ?? (j.isRemote ? "full_remote" : null);
    const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
      .filter(Boolean)
      .join(" / ");
    return buildJob({
      externalId: j.id,
      url: j.jobUrl,
      applyUrl: j.applyUrl ?? j.jobUrl,
      title: j.title,
      companyName: ctx.companyName,
      locationRaw: locations || null,
      country: j.address?.postalAddress?.addressCountry ?? null,
      descriptionText: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
      remotePolicy,
      contractType: EMPLOYMENT[(j.employmentType ?? "").toLowerCase()] ?? null,
      salaryRaw: j.compensation?.scrapeableCompensationSalarySummary ?? null,
      tags: [j.department, j.team].filter((t): t is string => Boolean(t)),
      publishedAt: j.publishedAt,
      raw,
    });
  },
});
