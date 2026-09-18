import { readFileSync } from "node:fs";
import { join } from "node:path";

export const fixture = (...parts: string[]) =>
  readFileSync(join(import.meta.dirname, "fixtures", ...parts), "utf8");
export const fixtureJson = <T = unknown>(...parts: string[]) => JSON.parse(fixture(...parts)) as T;
