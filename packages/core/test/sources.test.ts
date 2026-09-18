import { describe, expect, it } from "vitest";
import { NormalizedJob } from "../src/domain/job";
import { ashby } from "../src/sources/ashby";
import { franceTravail } from "../src/sources/france-travail";
import { greenhouse } from "../src/sources/greenhouse";
import { jobicy } from "../src/sources/jobicy";
import { lever } from "../src/sources/lever";
import { recruitee } from "../src/sources/recruitee";
import { smartrecruiters } from "../src/sources/smartrecruiters";
import { parseTeamtailorFeed, teamtailor } from "../src/sources/teamtailor";
import { fixture, fixtureJson } from "./helpers";

const ctx = (companyName: string | null, config: unknown = {}) => ({ companyName, config });

describe("greenhouse", () => {
  const data = fixtureJson<{ jobs: unknown[] }>("greenhouse", "datadog.json");
  it("normalise toutes les annonces de la fixture", () => {
    for (const raw of data.jobs)
      expect(() => NormalizedJob.parse(greenhouse.normalize(raw, ctx("Datadog")))).not.toThrow();
  });
  it("mappe les champs clés", () => {
    const job = greenhouse.normalize(data.jobs[0], ctx("Datadog"));
    expect(job.externalId).toBe(greenhouse.externalId(data.jobs[0]));
    expect(job.companyName).toBe("Datadog");
    expect(job.countryCode).toBe("FR");
    expect(job.descriptionText.length).toBeGreaterThan(200);
    expect(job.descriptionText).not.toMatch(/&lt;|<p>/);
    expect(job.publishedAt).toBeInstanceOf(Date);
  });
  it("repère le stage dans le titre", () => {
    const intern = data.jobs
      .map((j) => greenhouse.normalize(j, ctx("Datadog")))
      .find((j) => /intern/i.test(j.title));
    expect(intern?.contractType).toBe("internship");
  });
});

describe("lever", () => {
  const data = fixtureJson<unknown[]>("lever", "qonto.json");
  it("utilise workplaceType et createdAt", () => {
    const jobs = data.map((raw) => lever.normalize(raw, ctx("Qonto")));
    expect(jobs[0]?.remotePolicy).toBe("hybrid");
    expect(jobs.find((j) => j.title === "Analytics Engineer")?.remotePolicy).toBe("full_remote");
    expect(jobs[0]?.publishedAt).toBeInstanceOf(Date);
    expect(jobs[0]?.countryCode).toBe("FR");
    expect(jobs[0]?.url).toMatch(/^https:\/\/jobs\.lever\.co\/qonto\//);
  });
});

describe("ashby", () => {
  const data = fixtureJson<{ jobs: unknown[] }>("ashby", "ashby.json");
  it("utilise workplaceType et la localisation (France parmi les pays éligibles)", () => {
    const job = ashby.normalize(data.jobs[0], ctx("Ashby"));
    expect(job.remotePolicy).toBe("full_remote");
    expect(job.remoteScope).toBe("france");
    expect(job.locationRaw).toContain("Remote - European Union");
    expect(job.url).toMatch(/jobs\.ashbyhq\.com/);
  });
});

describe("smartrecruiters", () => {
  const detail = fixtureJson<Record<string, unknown>>("smartrecruiters", "detail.json");
  it("normalise le détail avec les drapeaux remote et le type de contrat", () => {
    const job = smartrecruiters.normalize(
      { ...detail, _detailFetched: true },
      ctx(null, { company: "smartrecruiters" }),
    );
    expect(job.remotePolicy).toBe("full_remote");
    // typeOfEmployment « contract » est ambigu ; la description précise « 12-Month Fixed-Term Contract ».
    expect(job.contractType).toBe("cdd");
    expect(job.countryCode).toBe("PL");
    expect(job.descriptionText.length).toBeGreaterThan(100);
  });
  it("accepte un élément de liste sans détail", () => {
    const list = fixtureJson<{ content: unknown[] }>("smartrecruiters", "list.json");
    const job = smartrecruiters.normalize(list.content[0], ctx(null, { company: "smartrecruiters" }));
    expect(job.descriptionText).toBe("");
  });
});

describe("recruitee", () => {
  const data = fixtureJson<{ offers: unknown[] }>("recruitee", "aikido.json");
  it("mappe hybride, CDI et dates", () => {
    const job = recruitee.normalize(data.offers[0], ctx(null));
    expect(job.companyName).toBe("Aikido Security");
    expect(job.remotePolicy).toBe("hybrid");
    expect(job.contractType).toBe("cdi");
    expect(job.seniority).toBe("senior");
    expect(job.publishedAt?.toISOString()).toBe("2026-09-16T23:31:24.000Z");
  });
});

describe("teamtailor", () => {
  const items = parseTeamtailorFeed(fixture("teamtailor", "teamtailor.rss"));
  it("parse le flux RSS", () => {
    expect(items).toHaveLength(3);
  });
  it("mappe remoteStatus et les localisations", () => {
    const job = teamtailor.normalize(items[1], ctx("Teamtailor"));
    expect(job.title).toBe("Account Executive - UK Enterprise");
    expect(job.remotePolicy).toBe("hybrid");
    expect(job.locationRaw).toContain("London");
    expect(job.descriptionText).not.toContain("&lt;");
    expect(teamtailor.externalId(items[1])).toBeTruthy();
  });
});

describe("france_travail (fixture synthétique)", () => {
  const data = fixtureJson<{ resultats: unknown[] }>("france_travail", "search.json");
  it("mappe l'offre React en CDI full remote", () => {
    const job = franceTravail.normalize(data.resultats[0], ctx(null));
    expect(job).toMatchObject({
      externalId: "198XKZQ",
      companyName: "EXEMPLE SAAS",
      contractType: "cdi",
      remotePolicy: "full_remote",
      remoteScope: "france",
      countryCode: "FR",
      salary: { min: 45000, max: 55000 },
      seniority: "senior",
    });
    expect(job.url).toBe("https://candidat.francetravail.fr/offres/recherche/detail/198XKZQ");
  });
  it("repère le présentiel", () => {
    expect(franceTravail.normalize(data.resultats[1], ctx(null)).remotePolicy).toBe("hybrid");
  });
});

describe("jobicy", () => {
  const data = fixtureJson<{ jobs: unknown[] }>("jobicy", "engineering.json");
  it("marque les offres en full remote et conserve l'URL Jobicy", () => {
    const job = jobicy.normalize(data.jobs[0], ctx(null));
    expect(job.remotePolicy).toBe("full_remote");
    expect(job.remoteScope).toBe("other");
    expect(job.url).toMatch(/^https:\/\/jobicy\.com\//);
    expect(job.salary).toEqual({ min: null, max: null, raw: expect.stringContaining("PLN") });
  });
});
