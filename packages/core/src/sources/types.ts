import type { z } from "zod";
import type { SourceKind } from "../domain/enums";
import type { NormalizedJob } from "../domain/job";
import type { HttpClient } from "../http/client";
import type { Logger } from "../logger";

export interface FetchContext<Config, Cursor> {
  config: Config;
  cursor: Cursor | null;
  http: HttpClient;
  signal: AbortSignal;
  log: Logger;
}

export interface FetchResult<Cursor> {
  /** Payloads bruts, un par annonce. */
  items: unknown[];
  nextCursor: Cursor | null;
  /** false si le listing est incomplet (pagination interrompue) : on ne clôt alors rien. */
  complete: boolean;
}

export interface NormalizeContext {
  /** Nom de l'entreprise du registre, si la source est un board ATS. */
  companyName: string | null;
  config: unknown;
}

export interface JobSource<Config = unknown, Cursor = unknown> {
  kind: Exclude<SourceKind, "capture">;
  configSchema: z.ZodType<Config>;
  defaultIntervalMinutes: number;
  /** Plancher imposé par les CGU / rate limits de la source. */
  minIntervalMinutes: number;
  /** true : le listing renvoyé est exhaustif → une annonce absente est close. */
  completeListing: boolean;
  /** Délai minimal entre deux requêtes, par hôte. */
  hostIntervals?: Record<string, number>;
  fetch(ctx: FetchContext<Config, Cursor>): Promise<FetchResult<Cursor>>;
  /** Pure, testée sur fixtures. */
  normalize(raw: unknown, ctx: NormalizeContext): NormalizedJob;
  /** Identifiant natif, lu sans normaliser (sert au diff incrémental). */
  externalId(raw: unknown): string;
}

/** Aide au typage des adaptateurs : conserve les types Config/Cursor. */
export const defineSource = <Config, Cursor = null>(source: JobSource<Config, Cursor>) => source;

/** Grossier pré-filtre de rôle, pour éviter des appels de détail inutiles (SmartRecruiters). */
export const DEV_ROLE_HINT =
  /d[ée]v|engineer|ing[ée]nieur|front|full.?stack|react|javascript|typescript|node|web|software|logiciel|programm/i;
