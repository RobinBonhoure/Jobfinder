// Tests d'intégration contre une VRAIE base, dédiée aux tests (elle est vidée).
// Lancement : DATABASE_URL_TEST=postgres://…/jobhunt_test pnpm --filter @jobhunt/core test
// Sans DATABASE_URL_TEST, ce fichier est ignoré. Aucun appel réseau : fixtures + faux client LLM.
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureJson } from "./helpers";

const url = process.env.DATABASE_URL_TEST;
if (url) {
  // Doit précéder tout import de src/ : env() lit process.env en priorité sur .env.
  process.env.DATABASE_URL = url;
  process.env.ANTHROPIC_API_KEY = "fake";
}

let mode: "ok" | "invalid" | "hybrid" = "ok";
let calls = 0;
const fakeClient = {
  messages: {
    parse: async (params: { messages: Array<{ content: string }> }) => {
      calls++;
      const content = params.messages[0]?.content ?? "";
      if (content.includes("<page_text>")) {
        return {
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 10 },
          parsed_output: {
            is_job_posting: !content.includes("Page sans offre"),
            title: "Développeur React senior",
            company: "Capture SA",
            location: "Toulouse",
            remote_policy: "full_remote",
            contract: "cdi",
            seniority: "senior",
            salary: "",
            description_start: "Développeur React",
            description_end: "expérience.",
          },
        };
      }
      if (mode === "invalid")
        return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, parsed_output: {} };
      return {
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 20 },
        parsed_output: {
          score: mode === "hybrid" ? 20 : 90,
          justification: "Test.",
          matched_skills: ["React"],
          missing_skills: [],
          red_flags: [],
          hook: "Accroche.",
          remote_verdict: mode === "hybrid" ? "hybrid_or_onsite" : "full_remote_france_ok",
          contract_verdict: "cdi",
        },
      };
    },
  },
} as unknown as Anthropic;

describe.skipIf(!url)("intégration base de données", async () => {
  const { sql } = await import("drizzle-orm");
  const db = await import("../src/db");
  const { processJob, prepareJob } = await import("../src/ingest/process-job");
  const { greenhouse } = await import("../src/sources/greenhouse");
  const { jobicy } = await import("../src/sources/jobicy");
  const { loadCriteria } = await import("../src/profile");
  const apps = await import("../src/applications");
  const { scoreCluster } = await import("../src/scoring");
  const { setAnthropicClientForTests } = await import("../src/scoring/anthropic");
  const { ingestCapture, NotAJobPostingError } = await import("../src/capture");
  const { buildJob } = await import("../src/normalize");

  const criteria = loadCriteria();
  const ctx = (sourceId: string) => ({ sourceId, sourceCompanyId: null, criteria });

  beforeAll(async () => {
    setAnthropicClientForTests(fakeClient);
    const d = db.getDb();
    await d.execute(
      sql`truncate jobs, job_clusters, source_runs, llm_scores, applications, application_events, contacts, sources, companies cascade`,
    );
    await d.insert(db.schema.sources).values([
      { id: "greenhouse:test", kind: "greenhouse", label: "GH test", config: { token: "test" } },
      { id: "jobicy:test", kind: "jobicy", label: "Jobicy test", config: {} },
    ]);
  });
  afterAll(async () => {
    setAnthropicClientForTests(undefined);
    await db.closeDb();
  });

  const job = (
    externalId: string,
    title: string,
    company: string,
    description = "CDI, full remote en France. React, TypeScript, Next.js.",
  ) =>
    buildJob({
      externalId,
      url: `https://ex.com/${externalId}`,
      title,
      companyName: company,
      locationRaw: "Paris, France",
      descriptionText: description,
      raw: {},
    });

  it("ingère la fixture Greenhouse et reste idempotent", async () => {
    const data = fixtureJson<{ jobs: unknown[] }>("greenhouse", "datadog.json");
    const d = db.getDb();
    for (const raw of data.jobs) {
      const p = prepareJob(greenhouse.normalize(raw, { companyName: "Datadog", config: {} }), "Datadog");
      await d.transaction((tx) => processJob(tx, ctx("greenhouse:test"), p, undefined));
    }
    const [count] = await d.execute<{ n: number }>(sql`select count(*)::int as n from jobs`);
    const raw = data.jobs[0];
    const p = prepareJob(greenhouse.normalize(raw, { companyName: "Datadog", config: {} }), "Datadog");
    const res = await d.transaction((tx) => processJob(tx, ctx("greenhouse:test"), p, undefined));
    expect(res.created).toBe(false);
    const [again] = await d.execute<{ n: number }>(sql`select count(*)::int as n from jobs`);
    expect(again?.n).toBe(count?.n);
  });

  it("regroupe une même offre vue sur deux sources", async () => {
    const d = db.getDb();
    const a = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("x1", "Senior Frontend Engineer (H/F)", "Acme"), null),
        undefined,
      ),
    );
    const b = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("jobicy:test"),
        prepareJob(job("y1", "Senior Front-End Engineer", "Acme SAS"), null),
        undefined,
      ),
    );
    expect(b.clusterId).toBe(a.clusterId);
    const detail = await db.getClusterDetail(a.clusterId);
    expect(detail?.members).toHaveLength(2);
    expect(detail?.canonical?.sourceKind).toBe("greenhouse");
  });

  it("ne regroupe pas deux offres distinctes d'une même source", async () => {
    const d = db.getDb();
    const a = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("x2", "Frontend Engineer Payments", "Beta"), null),
        undefined,
      ),
    );
    const b = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("x3", "Frontend Engineer Payment", "Beta"), null),
        undefined,
      ),
    );
    expect(b.clusterId).not.toBe(a.clusterId);
  });

  it("score, met en cache, mémorise l'échec et masque les verdicts éliminatoires", async () => {
    const d = db.getDb();
    const ok = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("s1", "Développeur React", "Gamma"), null),
        undefined,
      ),
    );
    const bad = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("s2", "Développeur Next.js", "Delta"), null),
        undefined,
      ),
    );
    const hyb = await d.transaction((tx) =>
      processJob(
        tx,
        ctx("greenhouse:test"),
        prepareJob(job("s3", "Développeur TypeScript", "Epsilon"), null),
        undefined,
      ),
    );
    mode = "ok";
    expect(await scoreCluster(ok.clusterId)).toBe("scored");
    const before = calls;
    expect(await scoreCluster(ok.clusterId)).toBe("cached");
    expect(calls).toBe(before);

    mode = "invalid";
    expect(await scoreCluster(bad.clusterId)).toBe("failed");
    expect(calls).toBe(before + 2);
    expect(await scoreCluster(bad.clusterId)).toBe("failed");
    expect(calls).toBe(before + 2);

    mode = "hybrid";
    expect(await scoreCluster(hyb.clusterId)).toBe("scored");
    const inbox = await db.listClusters({ triage: ["new"] });
    expect(inbox.some((r) => r.clusterId === hyb.clusterId)).toBe(false);
    expect(inbox.find((r) => r.clusterId === ok.clusterId)?.bestScore).toBe(90);
    expect(inbox.some((r) => r.clusterId === bad.clusterId)).toBe(true);
    mode = "ok";
  });

  it("gère le tri, la candidature et son historique", async () => {
    const [first] = await db.listClusters({ triage: ["new"] });
    if (!first) throw new Error("inbox vide");
    await apps.setTriage(first.clusterId, "applied");
    const detail = await db.getClusterDetail(first.clusterId);
    expect(detail?.application?.status).toBe("applied");
    await apps.updateApplicationStatus(detail?.application?.id as string, "interview");
    const pipeline = await db.listPipeline();
    expect(pipeline.find((p) => p.app.clusterId === first.clusterId)?.app.status).toBe("interview");
  });

  it("capture une page et refuse une page sans offre", async () => {
    const res = await ingestCapture({
      url: "https://www.linkedin.com/jobs/view/123456/?trk=x",
      pageTitle: "Offre",
      text: "Menu. Développeur React senior en CDI full remote, 5 ans d'expérience. Pied de page.",
    });
    expect(res.status).toBe("created");
    expect(res.score).toBe(90);
    const dup = await ingestCapture({
      url: "https://www.linkedin.com/jobs/view/123456",
      pageTitle: "Offre",
      text: "Menu. Développeur React senior en CDI full remote, 5 ans d'expérience. Pied de page.",
    });
    expect(dup.status).toBe("duplicate");
    await expect(
      ingestCapture({ url: "https://ex.com/a", pageTitle: "", text: "Page sans offre ".repeat(10) }),
    ).rejects.toBeInstanceOf(NotAJobPostingError);
  });

  it("jobicy passe par le même pipeline", async () => {
    const data = fixtureJson<{ jobs: unknown[] }>("jobicy", "engineering.json");
    const p = prepareJob(jobicy.normalize(data.jobs[0], { companyName: null, config: {} }), null);
    const res = await db.getDb().transaction((tx) => processJob(tx, ctx("jobicy:test"), p, undefined));
    expect(res.created).toBe(true);
  });
});
