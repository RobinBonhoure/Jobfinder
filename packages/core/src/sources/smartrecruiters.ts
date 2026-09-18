import { z } from "zod";
import type { ContractType, RemotePolicy, Seniority } from "../domain/enums";
import { errorMessage } from "../logger";
import { buildJob } from "../normalize/build";
import { htmlToText } from "../normalize/text";
import { DEV_ROLE_HINT, defineSource } from "./types";

const Config = z.object({ company: z.string().min(1) });

const Section = z.looseObject({ title: z.string().nullish(), text: z.string().nullish() }).nullish();

const Posting = z.looseObject({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().nullish(),
  company: z.looseObject({ name: z.string().nullish() }).nullish(),
  location: z
    .looseObject({
      city: z.string().nullish(),
      region: z.string().nullish(),
      country: z.string().nullish(),
      remote: z.boolean().nullish(),
      hybrid: z.boolean().nullish(),
      fullLocation: z.string().nullish(),
    })
    .nullish(),
  typeOfEmployment: z.looseObject({ id: z.string().nullish(), label: z.string().nullish() }).nullish(),
  experienceLevel: z.looseObject({ id: z.string().nullish() }).nullish(),
  department: z.looseObject({ label: z.string().nullish() }).nullish(),
  postingUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  jobAd: z
    .looseObject({
      sections: z
        .looseObject({
          companyDescription: Section,
          jobDescription: Section,
          qualifications: Section,
          additionalInformation: Section,
        })
        .nullish(),
    })
    .nullish(),
  /** Ajouté par fetch : false si le détail n'a pas été récupéré (pré-filtre). */
  _detailFetched: z.boolean().optional(),
});

// « contract » est ambigu (contrat de travail ou prestation) : laissé inconnu, le LLM tranche.
const EMPLOYMENT: Record<string, ContractType> = {
  permanent: "cdi",
  intern: "internship",
  internship: "internship",
  temporary: "cdd",
  apprenticeship: "apprenticeship",
};
const LEVEL: Record<string, Seniority> = {
  internship: "junior",
  entry_level: "junior",
  associate: "mid",
  mid_senior_level: "senior",
  director: "lead",
  executive: "lead",
};

const PAGE = 100;

export const smartrecruiters = defineSource({
  kind: "smartrecruiters",
  configSchema: Config,
  defaultIntervalMinutes: 720,
  minIntervalMinutes: 360,
  completeListing: true,
  hostIntervals: { "api.smartrecruiters.com": 1000 },

  async fetch({ config, http, signal, log }) {
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(config.company)}/postings`;
    const list: Array<Record<string, unknown>> = [];
    let complete = false;
    for (let offset = 0; offset < 2000; offset += PAGE) {
      const page = await http.getJson<{ content?: Array<Record<string, unknown>>; totalFound?: number }>(
        `${base}?limit=${PAGE}&offset=${offset}`,
        { signal },
      );
      list.push(...(page.content ?? []));
      if (offset + PAGE >= (page.totalFound ?? 0)) {
        complete = true;
        break;
      }
    }
    // Détail (description) uniquement pour les titres qui ressemblent à un poste de dev : évite le N+1 complet.
    const items: unknown[] = [];
    for (const item of list) {
      const name = String(item.name ?? "");
      if (!DEV_ROLE_HINT.test(name)) {
        items.push({ ...item, _detailFetched: false });
        continue;
      }
      try {
        const detail = await http.getJson<Record<string, unknown>>(`${base}/${String(item.id)}`, { signal });
        items.push({ ...item, ...detail, _detailFetched: true });
      } catch (err) {
        log.warn("détail SmartRecruiters indisponible", { id: item.id, error: errorMessage(err) });
        items.push({ ...item, _detailFetched: false });
      }
    }
    return { items, nextCursor: null, complete };
  },

  externalId: (raw) => Posting.parse(raw).id,

  normalize(raw, ctx) {
    const p = Posting.parse(raw);
    const s = p.jobAd?.sections;
    const description = [
      s?.jobDescription,
      s?.qualifications,
      s?.additionalInformation,
      s?.companyDescription,
    ]
      .filter((x) => x?.text)
      .map((x) => `${x?.title ?? ""}\n${htmlToText(x?.text ?? "")}`)
      .join("\n\n");
    const loc = p.location;
    const remotePolicy: RemotePolicy | null = loc?.remote ? "full_remote" : loc?.hybrid ? "hybrid" : null;
    const company = Config.safeParse(ctx.config).data?.company ?? "";
    const url = p.postingUrl ?? `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${p.id}`;
    return buildJob({
      externalId: p.id,
      url,
      applyUrl: p.applyUrl ?? url,
      title: p.name,
      companyName: p.company?.name ?? ctx.companyName,
      locationRaw: loc?.fullLocation ?? ([loc?.city, loc?.country].filter(Boolean).join(", ") || null),
      country: loc?.country ?? null,
      descriptionText: description,
      remotePolicy,
      contractType: EMPLOYMENT[p.typeOfEmployment?.id ?? ""] ?? null,
      seniority: LEVEL[p.experienceLevel?.id ?? ""] ?? null,
      tags: [p.department?.label].filter((t): t is string => Boolean(t)),
      publishedAt: p.releasedDate,
      raw,
    });
  },
});
