import { describe, expect, it } from "vitest";
import { evaluateJob, type FilterInput } from "../src/filter/evaluate";
import { loadCriteria } from "../src/profile";

const criteria = loadCriteria();

const base: FilterInput = {
  title: "Développeur Front-End React",
  descriptionText: "CDI, full remote. React, Next.js, TypeScript.",
  companyName: "Acme",
  locationRaw: "Paris, France",
  remotePolicy: "full_remote",
  remoteScope: "france",
  contractType: "cdi",
  seniority: "senior",
};

const run = (patch: Partial<FilterInput>, advisory = false) =>
  evaluateJob({ ...base, ...patch }, criteria, { advisory });

describe("evaluateJob", () => {
  it("laisse passer l'offre cible avec un bon pré-score", () => {
    const r = run({});
    expect(r.status).toBe("passed");
    expect(r.reasons).toEqual([]);
    expect(r.ruleScore).toBeGreaterThanOrEqual(80);
  });

  it.each<[string, Partial<FilterInput>, string]>([
    ["stage", { contractType: "internship" }, "contract:internship"],
    ["freelance", { contractType: "freelance" }, "contract:freelance"],
    ["hybride hors Toulouse", { remotePolicy: "hybrid" }, "remote:hybrid"],
    ["US only", { remoteScope: "other" }, "geo:other"],
    ["pas un poste de dev", { title: "Account Executive" }, "role:not_dev"],
    [
      "aucune techno cible",
      { descriptionText: "Python, Django", title: "Software Engineer" },
      "stack_required:none",
    ],
    ["junior", { title: "Développeur React Junior" }, "seniority:\\bjunior\\b"],
    [
      "manager",
      { title: "Engineering Manager Frontend" },
      "stack_exclusion:\\bmanager\\b|\\bhead of\\b|\\bdirector\\b|\\bvp\\b|\\bcto\\b",
    ],
  ])("rejette : %s", (_, patch, reason) => {
    const r = run(patch);
    expect(r.status).toBe("rejected");
    expect(r.reasons).toContain(reason);
  });

  it("ne rejette pas l'inconnu mais le signale", () => {
    const r = run({ remotePolicy: "unknown", contractType: "unknown", remoteScope: "unknown" });
    expect(r.status).toBe("passed");
    expect(r.flags).toEqual(expect.arrayContaining(["remote:unknown", "contract:unknown"]));
  });

  it("signale une portée européenne à vérifier", () => {
    expect(run({ remoteScope: "europe" }).flags).toContain("geo:check_french_entity");
  });

  it("exclut le backend pur mais garde le fullstack orienté backend", () => {
    expect(run({ title: "Senior Backend Engineer" }).status).toBe("rejected");
    expect(run({ title: "Senior Fullstack TS Developer (backend-oriented)" }).status).toBe("passed");
  });

  it.each([
    ["Développeur PHP Symfony", "rejected"],
    ["Développeur Java Spring", "rejected"],
    ["Développeur .NET C#", "rejected"],
    ["Développeur Fullstack Java / React", "passed"],
    ["Développeur PHP / Vue.js", "passed"],
    ["Développeur Angular", "passed"],
    ["Développeur Vue.js / Nuxt", "passed"],
    ["Développeur React Native (iOS / Android)", "passed"],
    ["Développeur iOS Swift", "rejected"],
  ] as const)("backend et mobile : %s → %s", (title, status) => {
    expect(run({ title, descriptionText: `${base.descriptionText} ${title}` }).status).toBe(status);
  });

  it("hybride près de Toulouse : signalé, pas rejeté, et sous le full remote", () => {
    const local = run({ remotePolicy: "hybrid", locationRaw: "Labège (31)" });
    expect(local.status).toBe("passed");
    expect(local.flags).toContain("remote:hybrid_local");
    expect(local.ruleScore).toBeLessThan(run({}).ruleScore);
    expect(run({ remotePolicy: "onsite", locationRaw: "31 - TOULOUSE" }).status).toBe("passed");
    expect(run({ remotePolicy: "hybrid", locationRaw: "Bordeaux" }).status).toBe("rejected");
  });

  it("bonus pour un full remote chez un employeur toulousain", () => {
    // Offre moins complète que la référence (plafonnée à 100) pour que le bonus soit visible.
    const partial = { contractType: "unknown", seniority: "unknown" } as const;
    expect(run({ ...partial, locationRaw: "Toulouse, France" }).ruleScore).toBeGreaterThan(
      run(partial).ruleScore,
    );
  });

  it("pénalise les ESN sans les rejeter", () => {
    const esn = run({
      descriptionText: `${base.descriptionText} ESN, mission chez nos clients grands comptes, intercontrat.`,
    });
    expect(esn.status).toBe("passed");
    expect(esn.ruleScore).toBeLessThan(run({}).ruleScore);
  });

  it("ne confond pas JavaScript et Java", () => {
    expect(run({ title: "JavaScript Developer" }).status).toBe("passed");
  });

  it("mode conseil : calcule les raisons mais laisse passer", () => {
    const r = run({ remotePolicy: "hybrid" }, true);
    expect(r.status).toBe("passed");
    expect(r.reasons).toContain("remote:hybrid");
  });

  it("pénalise les exclusions dans la description sans rejeter", () => {
    const clean = run({}).ruleScore;
    const noisy = run({
      descriptionText: `${base.descriptionText} Mission chez notre client, astreintes, PHP.`,
    }).ruleScore;
    expect(noisy).toBeLessThan(clean);
  });
});
