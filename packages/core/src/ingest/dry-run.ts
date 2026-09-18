import { DomainError } from "../domain/action-result";
import type { SourceKind } from "../domain/enums";
import { evaluateJob, type FilterResult } from "../filter/evaluate";
import { HttpClient } from "../http/client";
import { errorMessage, logger } from "../logger";
import { loadCriteria } from "../profile";
import { getAdapter } from "../sources/registry";

export interface DryRunJob {
  title: string;
  url: string;
  location: string | null;
  remotePolicy: string;
  contractType: string;
  filter: FilterResult;
}

export interface DryRunResult {
  fetched: number;
  normalized: number;
  failed: number;
  passed: DryRunJob[];
  rejected: DryRunJob[];
  sampleTitles: string[];
}

/** Fetch + normalisation + filtre, sans écrire en base (« tester ce board », CLI de diagnostic). */
export async function dryRunSource(
  kind: SourceKind,
  rawConfig: unknown,
  companyName: string | null,
  signal?: AbortSignal,
): Promise<DryRunResult> {
  const adapter = getAdapter(kind);
  if (!adapter) throw new DomainError("VALIDATION", `Type de source non testable : ${kind}`);
  const parsed = adapter.configSchema.safeParse(rawConfig);
  if (!parsed.success)
    throw new DomainError("VALIDATION", `Configuration invalide : ${parsed.error.message}`);
  const http = new HttpClient();
  for (const [host, ms] of Object.entries(adapter.hostIntervals ?? {})) http.setHostInterval(host, ms);
  const log = logger.child(`dry-run:${kind}`);
  let result: Awaited<ReturnType<typeof adapter.fetch>>;
  try {
    result = await adapter.fetch({
      config: parsed.data,
      cursor: null,
      http,
      signal: signal ?? AbortSignal.timeout(120_000),
      log,
    });
  } catch (err) {
    throw new DomainError("UPSTREAM", `Source injoignable : ${errorMessage(err)}`);
  }
  const criteria = loadCriteria();
  const out: DryRunResult = {
    fetched: result.items.length,
    normalized: 0,
    failed: 0,
    passed: [],
    rejected: [],
    sampleTitles: [],
  };
  for (const raw of result.items) {
    try {
      const job = adapter.normalize(raw, { companyName, config: parsed.data });
      out.normalized++;
      const filter = evaluateJob(job, criteria);
      const row: DryRunJob = {
        title: job.title,
        url: job.url,
        location: job.locationRaw,
        remotePolicy: job.remotePolicy,
        contractType: job.contractType,
        filter,
      };
      (filter.status === "passed" ? out.passed : out.rejected).push(row);
      if (out.sampleTitles.length < 3) out.sampleTitles.push(job.title);
    } catch (err) {
      out.failed++;
      log.debug("normalisation impossible", { error: errorMessage(err) });
    }
  }
  out.passed.sort((a, b) => b.filter.ruleScore - a.filter.ruleScore);
  return out;
}
