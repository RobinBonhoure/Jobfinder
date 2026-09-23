import { describe, expect, it } from "vitest";
import {
  COVER_LETTER_PROMPT_VERSION,
  EXTRACTION_PROMPT_VERSION,
  OUTREACH_PROMPT_VERSION,
  PROMPT_VERSION,
} from "../src/scoring/config";
import { loadPrompt, render } from "../src/scoring/prompt";

const VERSIONS = [
  PROMPT_VERSION,
  EXTRACTION_PROMPT_VERSION,
  OUTREACH_PROMPT_VERSION,
  COVER_LETTER_PROMPT_VERSION,
];

/** Variables passées par le code appelant : `render` jette si le prompt en attend une autre. */
const VARS: Record<string, Record<string, string>> = {
  [COVER_LETTER_PROMPT_VERSION]: {
    CV: "cv",
    SIGNATURE: "signature",
    title: "Développeur front-end React",
    company: "Acme",
    location: "Toulouse",
    remote_policy: "full remote",
    contract_type: "CDI",
    salary: "non communiqué",
    hook: "accroche",
    description: "description",
    extra: "aucune",
  },
};

describe("prompts", () => {
  it.each(VERSIONS)("%s est bien formé", (version) => {
    const prompt = loadPrompt(version);
    expect(prompt.system.length).toBeGreaterThan(50);
    expect(prompt.user.length).toBeGreaterThan(10);
  });

  it("le prompt de lettre consomme exactement les variables fournies par le code", () => {
    const vars = VARS[COVER_LETTER_PROMPT_VERSION] as Record<string, string>;
    const prompt = loadPrompt(COVER_LETTER_PROMPT_VERSION);
    const rendered = `${render(prompt.system, vars)}\n${render(prompt.user, vars)}`;
    expect(rendered).not.toMatch(/\{\{/);
  });

  it("une variable manquante est une erreur", () => {
    expect(() => render("{{absente}}", {})).toThrow(/absente/);
  });
});
