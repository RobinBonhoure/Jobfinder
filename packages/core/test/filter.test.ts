import { describe, expect, it } from "vitest";
import { evaluateJob, type FilterInput } from "../src/filter/evaluate";
import { loadCriteria } from "../src/profile";

const criteria = loadCriteria();

const base: FilterInput = {
  title: "Développeur Front-End React",
  descriptionText: "CDI, full remote. React, Next.js, TypeScript.",
  companyName: "Acme",
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
    ["hybride explicite", { remotePolicy: "hybrid" }, "remote:hybrid"],
    ["US only", { remoteScope: "other" }, "geo:other"],
    ["pas un poste de dev", { title: "Account Executive" }, "role:not_dev"],
    ["PHP dans le titre", { title: "Développeur PHP Symfony" }, "stack_exclusion:\\bphp\\b"],
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
