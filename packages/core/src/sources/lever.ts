import { z } from "zod";
import type { RemotePolicy } from "../domain/enums";
import { buildJob } from "../normalize/build";
import { contractFromLabel } from "../normalize/contract";
import { htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({
  company: z.string().min(1),
  region: z.enum(["global", "eu"]).default("global"),
});

const LeverPosting = z.looseObject({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  country: z.string().nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  description: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  lists: z.array(z.looseObject({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  categories: z
    .looseObject({
      commitment: z.string().nullish(),
      location: z.string().nullish(),
      team: z.string().nullish(),
      department: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  salaryRange: z
    .looseObject({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

const WORKPLACE: Record<string, RemotePolicy> = {
  remote: "full_remote",
  hybrid: "hybrid",
  "on-site": "onsite",
  onsite: "onsite",
};

const PAGE = 100;

export const lever = defineSource({
  kind: "lever",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 180,
  completeListing: true,
  hostIntervals: { "api.lever.co": 500, "api.eu.lever.co": 500 },

  async fetch({ config, http, signal }) {
    const host = config.region === "eu" ? "https://api.eu.lever.co" : "https://api.lever.co";
    const items: unknown[] = [];
    for (let skip = 0; skip < 5000; skip += PAGE) {
      const url = `${host}/v0/postings/${encodeURIComponent(config.company)}?mode=json&skip=${skip}&limit=${PAGE}`;
      const page = await http.getJson<unknown[]>(url, { signal });
      if (!Array.isArray(page)) throw new Error(`Réponse Lever inattendue pour ${config.company}`);
      items.push(...page);
      if (page.length < PAGE) return { items, nextCursor: null, complete: true };
    }
    return { items, nextCursor: null, complete: false };
  },

  externalId: (raw) => LeverPosting.parse(raw).id,

  normalize(raw, ctx) {
    const p = LeverPosting.parse(raw);
    const lists = (p.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`).join("\n\n");
    const description = [
      p.descriptionPlain ?? htmlToText(p.description ?? ""),
      lists,
      p.additionalPlain ?? "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const locations = p.categories?.allLocations?.length
      ? p.categories.allLocations.join(" / ")
      : (p.categories?.location ?? null);
    const salary = p.salaryRange;
    return buildJob({
      externalId: p.id,
      url: p.hostedUrl,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      title: p.text,
      companyName: ctx.companyName,
      locationRaw: locations,
      country: p.country,
      descriptionText: description,
      remotePolicy: WORKPLACE[(p.workplaceType ?? "").toLowerCase()] ?? null,
      contractType: contractFromLabel(p.categories?.commitment),
      salaryRaw: salary
        ? `${salary.min ?? ""}-${salary.max ?? ""} ${salary.currency ?? ""} ${salary.interval ?? ""}`
        : null,
      tags: [p.categories?.team, p.categories?.department].filter((t): t is string => Boolean(t)),
      publishedAt: p.createdAt ?? null,
      raw,
    });
  },
});
