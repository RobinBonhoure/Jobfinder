import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

let cachedRoot: string | undefined;

/** Racine du monorepo : premier dossier parent contenant pnpm-workspace.yaml. */
export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`pnpm-workspace.yaml introuvable depuis ${process.cwd()}`);
    dir = parent;
  }
}

export const profilePath = (...parts: string[]) => join(repoRoot(), "profile", ...parts);
export const corePath = (...parts: string[]) => join(repoRoot(), "packages", "core", ...parts);
