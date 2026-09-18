import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { RemotePolicy } from "../domain/enums";
import { buildJob } from "../normalize/build";
import { htmlToText } from "../normalize/text";
import { defineSource } from "./types";

const Config = z.object({
  /** URL complète du flux, ex. https://acme.teamtailor.com/jobs.rss ou https://careers.acme.com/jobs.rss */
  feedUrl: z.url(),
});

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  processEntities: true,
  isArray: (name) => name === "item" || name === "location",
  parseTagValue: false,
});

const Item = z.looseObject({
  title: z.string(),
  link: z.string(),
  guid: z.union([z.string(), z.looseObject({ "#text": z.string() })]).nullish(),
  description: z.string().nullish(),
  pubDate: z.string().nullish(),
  remoteStatus: z.string().nullish(),
  department: z.string().nullish(),
  role: z.string().nullish(),
  locations: z
    .looseObject({
      location: z
        .array(
          z.looseObject({
            name: z.string().nullish(),
            city: z.string().nullish(),
            country: z.string().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish()
    .or(z.literal("")),
});

const REMOTE: Record<string, RemotePolicy> = {
  none: "onsite",
  hybrid: "hybrid",
  fully: "full_remote",
  full: "full_remote",
  remote: "full_remote",
};

export function parseTeamtailorFeed(xml: string): unknown[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown[] } } };
  return doc.rss?.channel?.item ?? [];
}

const guidOf = (item: z.infer<typeof Item>) =>
  typeof item.guid === "string" ? item.guid : (item.guid?.["#text"] ?? item.link);

export const teamtailor = defineSource({
  kind: "teamtailor",
  configSchema: Config,
  defaultIntervalMinutes: 360,
  minIntervalMinutes: 180,
  completeListing: true,

  async fetch({ config, http, signal }) {
    const xml = await http.getText(config.feedUrl, {
      signal,
      headers: { accept: "application/rss+xml, application/xml;q=0.9" },
    });
    return { items: parseTeamtailorFeed(xml), nextCursor: null, complete: true };
  },

  externalId: (raw) => guidOf(Item.parse(raw)),

  normalize(raw, ctx) {
    const item = Item.parse(raw);
    const locations =
      typeof item.locations === "object" && item.locations ? (item.locations.location ?? []) : [];
    const first = locations[0];
    return buildJob({
      externalId: guidOf(item),
      url: item.link,
      applyUrl: item.link,
      title: item.title,
      companyName: ctx.companyName,
      locationRaw:
        locations
          .map((l) => l.name ?? l.city)
          .filter(Boolean)
          .join(" / ") || null,
      country: first?.country ?? null,
      descriptionText: htmlToText(item.description ?? ""),
      remotePolicy: REMOTE[(item.remoteStatus ?? "").toLowerCase()] ?? null,
      tags: [item.department, item.role].filter((t): t is string => Boolean(t)),
      publishedAt: item.pubDate,
      raw,
    });
  },
});
