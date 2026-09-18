import { readFileSync } from "node:fs";
import { corePath } from "../paths";

const cache = new Map<string, { system: string; user: string }>();

/** Charge un prompt versionné depuis packages/core/prompts/<name>.md (`<!-- system -->` / `<!-- user -->`). */
export function loadPrompt(name: string): { system: string; user: string } {
  const hit = cache.get(name);
  if (hit) return hit;
  const content = readFileSync(corePath("prompts", `${name}.md`), "utf8");
  return parsePrompt(content, name);
}

export function parsePrompt(content: string, name: string): { system: string; user: string } {
  const sys = content.indexOf("<!-- system -->");
  const usr = content.indexOf("<!-- user -->");
  if (sys < 0 || usr < 0 || usr < sys) throw new Error(`Prompt ${name} mal formé (marqueurs system/user)`);
  const parsed = {
    system: content.slice(sys + "<!-- system -->".length, usr).trim(),
    user: content.slice(usr + "<!-- user -->".length).trim(),
  };
  cache.set(name, parsed);
  return parsed;
}

/** Remplace les {{variables}} ; une variable absente est une erreur (prompt incohérent). */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`Variable de prompt manquante : ${key}`);
    return v;
  });
}
