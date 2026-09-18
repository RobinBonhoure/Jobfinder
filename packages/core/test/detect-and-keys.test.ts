import { describe, expect, it } from "vitest";
import { contentHash, dedupKey, sourcePriority, titleQualifiers } from "../src/dedup/keys";
import { nextActionFor } from "../src/domain/pipeline";
import { parsePrompt, render } from "../src/scoring/prompt";
import { detectAtsFromUrl, findAtsInHtml } from "../src/sources/detect";

describe("detectAtsFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/algolia", "greenhouse:algolia", { token: "algolia" }],
    ["https://job-boards.eu.greenhouse.io/mirakl/jobs/123", "greenhouse:mirakl", { token: "mirakl" }],
    ["https://boards-api.greenhouse.io/v1/boards/dataiku/jobs", "greenhouse:dataiku", { token: "dataiku" }],
    ["https://jobs.lever.co/swile/abc", "lever:swile", { company: "swile", region: "global" }],
    ["https://jobs.eu.lever.co/foo", "lever:foo", { company: "foo", region: "eu" }],
    ["https://jobs.ashbyhq.com/doctolib/123", "ashby:doctolib", { name: "doctolib" }],
    ["https://livestorm.recruitee.com/o/dev", "recruitee:livestorm", { company: "livestorm" }],
    [
      "https://acme.teamtailor.com/jobs/1-dev",
      "teamtailor:acme",
      { feedUrl: "https://acme.teamtailor.com/jobs.rss" },
    ],
    ["https://jobs.smartrecruiters.com/Ubisoft2/123", "smartrecruiters:ubisoft2", { company: "Ubisoft2" }],
  ])("%s", (url, id, config) => {
    const d = detectAtsFromUrl(url);
    expect(d?.sourceId).toBe(id);
    expect(d?.config).toEqual(config);
  });

  it("ignore les URL inconnues ou invalides", () => {
    expect(detectAtsFromUrl("https://www.welcometothejungle.com/fr/companies/x")).toBeNull();
    expect(detectAtsFromUrl("pas une url")).toBeNull();
  });

  it("trouve un ATS embarqué dans une page carrières", () => {
    const html = `<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme"></iframe>`;
    expect(findAtsInHtml(html, "https://acme.com/careers").map((d) => d.sourceId)).toContain(
      "greenhouse:acme",
    );
  });
});

describe("clés de dédup", () => {
  it("hash stable et sensible au contenu", () => {
    const a = contentHash("dev react", "acme", "Texte  \n\n\n  ici");
    expect(a).toBe(contentHash("dev react", "acme", "Texte\n\nici"));
    expect(a).not.toBe(contentHash("dev react", "acme", "Autre texte"));
    expect(a).toHaveLength(64);
  });
  it("pas de clé sans entreprise", () => {
    expect(dedupKey("", "dev react")).toBeNull();
    expect(dedupKey("acme", "dev react")).toBe("acme|dev react");
  });
  it("distingue les qualificatifs de titre", () => {
    expect(titleQualifiers("product manager paper.io 2")).not.toBe(
      titleQualifiers("senior product manager paper.io 2"),
    );
    expect(titleQualifiers("customer experience representative french speaker")).not.toBe(
      titleQualifiers("customer experience representative german speaker"),
    );
    expect(titleQualifiers("fullstack software engineer core")).toBe(
      titleQualifiers("software engineer fullstack core"),
    );
  });
  it("priorise les ATS", () => {
    expect(sourcePriority("greenhouse")).toBeLessThan(sourcePriority("france_travail"));
    expect(sourcePriority("capture")).toBeLessThan(sourcePriority("jobicy"));
  });
});

describe("pipeline", () => {
  it("calcule la relance", () => {
    expect(nextActionFor("applied", new Date(2026, 8, 1))).toBe("2026-09-08");
    expect(nextActionFor("followed_up", new Date(2026, 8, 1))).toBe("2026-09-11");
    expect(nextActionFor("interview")).toBeNull();
  });
});

describe("prompts", () => {
  it("découpe system/user et remplace les variables", () => {
    const p = parsePrompt("<!-- system -->\nS {{A}}\n<!-- user -->\nU {{B}}", "test");
    expect(render(p.system, { A: "1" })).toBe("S 1");
    expect(() => render(p.user, {})).toThrow(/B/);
  });
});
