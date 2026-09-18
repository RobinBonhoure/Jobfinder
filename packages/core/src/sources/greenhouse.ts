import { z } from "zod";
import { buildJob } from "../normalize/build";
import { htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({ token: z.string().min(1) });

const GhJob = z.looseObject({
  id: z.number(),
  title: z.string(),
  company_name: z.string().nullish(),
  absolute_url: z.string(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  content: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  metadata: z.array(z.looseObject({ name: z.string(), value: z.unknown() })).nullish(),
  departments: z.array(z.looseObject({ name: z.string() })).nullish(),
});

const metadataValue = (job: z.infer<typeof GhJob>, name: RegExp): string | null => {
  const m = job.metadata?.find((x) => name.test(x.name));
  return typeof m?.value === "string" ? m.value : null;
};

export const greenhouse = defineSource({
  kind: "greenhouse",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 180,
  completeListing: true,
  hostIntervals: { "boards-api.greenhouse.io": 500 },

  async fetch({ config, http, signal }) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(config.token)}/jobs?content=true`;
    const data = await http.getJson<{ jobs?: unknown[] }>(url, { signal });
    return { items: data.jobs ?? [], nextCursor: null, complete: true };
  },

  externalId: (raw) => String(GhJob.parse(raw).id),

  normalize(raw, ctx) {
    const job = GhJob.parse(raw);
    const location = job.location?.name ?? null;
    const extra = [metadataValue(job, /work ?place|remote/i), metadataValue(job, /location type/i)]
      .filter(Boolean)
      .join(" ");
    return buildJob({
      externalId: String(job.id),
      url: job.absolute_url,
      applyUrl: job.absolute_url,
      title: job.title,
      companyName: job.company_name ?? ctx.companyName,
      locationRaw: [location, extra].filter(Boolean).join(" — ") || null,
      descriptionText: htmlToText(job.content ?? ""),
      salaryRaw: metadataValue(job, /salary|pay|compensation/i),
      tags: (job.departments ?? []).map((d) => d.name),
      publishedAt: job.first_published,
      sourceUpdatedAt: job.updated_at,
      raw,
    });
  },
});
