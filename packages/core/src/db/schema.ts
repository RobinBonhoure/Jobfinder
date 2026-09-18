import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_KINDS,
  APPLICATION_STATUSES,
  CONSENT_BASES,
  CONTACT_KINDS,
  CONTRACT_TYPES,
  CONTRACT_VERDICTS,
  FILTER_STATUSES,
  OUTREACH_STATUSES,
  REMOTE_POLICIES,
  REMOTE_SCOPES,
  REMOTE_VERDICTS,
  RUN_STATUSES,
  SCORE_STATUSES,
  SENIORITIES,
  SOURCE_KINDS,
  TRIAGE_STATUSES,
} from "../domain/enums";

// Conventions : noms SQL explicites en snake_case (pas d'option `casing`, compatibilité Drizzle 1.0).

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tstz("created_at").notNull().defaultNow();
const updatedAt = () =>
  tstz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const remotePolicyEnum = pgEnum("remote_policy", REMOTE_POLICIES);
export const remoteScopeEnum = pgEnum("remote_scope", REMOTE_SCOPES);
export const contractTypeEnum = pgEnum("contract_type", CONTRACT_TYPES);
export const seniorityEnum = pgEnum("seniority", SENIORITIES);
export const sourceKindEnum = pgEnum("source_kind", SOURCE_KINDS);
export const filterStatusEnum = pgEnum("filter_status", FILTER_STATUSES);
export const triageEnum = pgEnum("triage_status", TRIAGE_STATUSES);
export const scoreStatusEnum = pgEnum("score_status", SCORE_STATUSES);
export const remoteVerdictEnum = pgEnum("remote_verdict", REMOTE_VERDICTS);
export const contractVerdictEnum = pgEnum("contract_verdict", CONTRACT_VERDICTS);
export const llmStatusEnum = pgEnum("llm_status", ["ok", "failed"]);
export const runStatusEnum = pgEnum("run_status", RUN_STATUSES);
export const applicationKindEnum = pgEnum("application_kind", APPLICATION_KINDS);
export const applicationStatusEnum = pgEnum("application_status", APPLICATION_STATUSES);
export const applicationEventTypeEnum = pgEnum("application_event_type", APPLICATION_EVENT_TYPES);
export const outreachStatusEnum = pgEnum("outreach_status", OUTREACH_STATUSES);
export const contactKindEnum = pgEnum("contact_kind", CONTACT_KINDS);
export const consentBasisEnum = pgEnum("consent_basis", CONSENT_BASES);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    domain: text("domain"),
    website: text("website"),
    siren: char("siren", { length: 9 }),
    nafCode: text("naf_code"),
    naf25Code: text("naf25_code"),
    headcountRange: text("headcount_range"),
    city: text("city"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    outreachStatus: outreachStatusEnum("outreach_status").notNull().default("none"),
    notes: text("notes").notNull().default(""),
    source: text("source").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("companies_domain_uq").on(t.domain).where(sql`${t.domain} is not null`),
    uniqueIndex("companies_siren_uq").on(t.siren).where(sql`${t.siren} is not null`),
    index("companies_name_norm_idx").on(t.nameNorm),
    index("companies_name_norm_trgm_idx").using("gin", t.nameNorm.op("gin_trgm_ops")),
    index("companies_outreach_idx").on(t.outreachStatus),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    kind: sourceKindEnum("kind").notNull(),
    label: text("label").notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    config: jsonb("config").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    intervalMinutes: integer("interval_minutes").notNull().default(360),
    nextRunAt: tstz("next_run_at").notNull().defaultNow(),
    lastRunAt: tstz("last_run_at"),
    lastSuccessAt: tstz("last_success_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastError: text("last_error"),
    cursor: jsonb("cursor"),
    runningSince: tstz("running_since"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_due_idx").on(t.enabled, t.nextRunAt)],
);

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    status: runStatusEnum("status").notNull().default("running"),
    fetched: integer("fetched").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    closed: integer("closed").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    httpCalls: integer("http_calls").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("source_runs_source_started_idx").on(t.sourceId, t.startedAt.desc())],
);

export const jobClusters = pgTable(
  "job_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalJobId: uuid("canonical_job_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    dedupKey: text("dedup_key").notNull(),
    titleNorm: text("title_norm").notNull(),
    triage: triageEnum("triage").notNull().default("new"),
    triagedAt: tstz("triaged_at"),
    bestScore: smallint("best_score"),
    scoreStatus: scoreStatusEnum("score_status").notNull().default("not_needed"),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    closedAt: tstz("closed_at"),
    previousClusterId: uuid("previous_cluster_id").references((): AnyPgColumn => jobClusters.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("job_clusters_triage_score_idx").on(t.triage, t.bestScore.desc().nullsLast()),
    index("job_clusters_dedup_idx").on(t.dedupKey, t.lastSeenAt.desc()),
    index("job_clusters_score_status_idx").on(t.scoreStatus),
    index("job_clusters_company_idx").on(t.companyId, t.lastSeenAt.desc()),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    clusterId: uuid("cluster_id").references(() => jobClusters.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    companyNameRaw: text("company_name_raw"),
    title: text("title").notNull(),
    titleNorm: text("title_norm").notNull(),
    url: text("url").notNull(),
    applyUrl: text("apply_url"),
    locationRaw: text("location_raw"),
    countryCode: char("country_code", { length: 2 }),
    remotePolicy: remotePolicyEnum("remote_policy").notNull().default("unknown"),
    remoteScope: remoteScopeEnum("remote_scope").notNull().default("unknown"),
    contractType: contractTypeEnum("contract_type").notNull().default("unknown"),
    seniority: seniorityEnum("seniority").notNull().default("unknown"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryRaw: text("salary_raw"),
    descriptionText: text("description_text").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    publishedAt: tstz("published_at"),
    sourceUpdatedAt: tstz("source_updated_at"),
    firstSeenAt: tstz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    closedAt: tstz("closed_at"),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    filterStatus: filterStatusEnum("filter_status").notNull().default("pending"),
    filterReasons: text("filter_reasons").array().notNull().default(sql`'{}'::text[]`),
    filterFlags: text("filter_flags").array().notNull().default(sql`'{}'::text[]`),
    ruleScore: smallint("rule_score").notNull().default(0),
    forcedPass: boolean("forced_pass").notNull().default(false),
    raw: jsonb("raw"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jobs_source_external_uq").on(t.sourceId, t.externalId),
    index("jobs_cluster_idx").on(t.clusterId),
    index("jobs_content_hash_idx").on(t.contentHash),
    index("jobs_filter_seen_idx").on(t.filterStatus, t.firstSeenAt.desc()),
    index("jobs_title_norm_trgm_idx").using("gin", t.titleNorm.op("gin_trgm_ops")),
    index("jobs_company_seen_idx").on(t.companyId, t.lastSeenAt.desc()),
  ],
);

export const llmScores = pgTable(
  "llm_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    status: llmStatusEnum("status").notNull(),
    score: smallint("score"),
    justification: text("justification"),
    matchedSkills: text("matched_skills").array().notNull().default(sql`'{}'::text[]`),
    missingSkills: text("missing_skills").array().notNull().default(sql`'{}'::text[]`),
    redFlags: text("red_flags").array().notNull().default(sql`'{}'::text[]`),
    hook: text("hook"),
    remoteVerdict: remoteVerdictEnum("remote_verdict"),
    contractVerdict: contractVerdictEnum("contract_verdict"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    attempts: smallint("attempts").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("llm_scores_key_uq").on(t.contentHash, t.promptVersion, t.model)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: citext("email"),
    kind: contactKindEnum("kind").notNull(),
    label: text("label"),
    source: text("source").notNull(),
    collectedAt: tstz("collected_at").notNull().defaultNow(),
    consentBasis: consentBasisEnum("consent_basis").notNull(),
    mxValid: boolean("mx_valid"),
    mxCheckedAt: tstz("mx_checked_at"),
    infoNoticeSentAt: tstz("info_notice_sent_at"),
    optedOutAt: tstz("opted_out_at"),
    deletedAt: tstz("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contacts_email_uq").on(t.email).where(sql`${t.deletedAt} is null`),
    index("contacts_company_idx").on(t.companyId),
    check("contacts_email_present", sql`${t.deletedAt} is not null or ${t.email} is not null`),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: applicationKindEnum("kind").notNull(),
    clusterId: uuid("cluster_id").references(() => jobClusters.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    externalUrl: text("external_url"),
    externalTitle: text("external_title"),
    externalCompany: text("external_company"),
    status: applicationStatusEnum("status").notNull().default("to_apply"),
    appliedAt: tstz("applied_at"),
    nextActionAt: date("next_action_at", { mode: "string" }),
    channel: text("channel"),
    draftSubject: text("draft_subject"),
    draftBody: text("draft_body"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("applications_cluster_uq").on(t.clusterId).where(sql`${t.clusterId} is not null`),
    index("applications_status_next_idx").on(t.status, t.nextActionAt),
    check(
      "applications_target",
      sql`(${t.kind} = 'job' and (${t.clusterId} is not null or ${t.externalUrl} is not null))
        or (${t.kind} = 'spontaneous' and ${t.companyId} is not null)`,
    ),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: applicationEventTypeEnum("type").notNull(),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status"),
    note: text("note"),
    occurredAt: tstz("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("application_events_app_idx").on(t.applicationId, t.occurredAt.desc())],
);

export const workerHeartbeat = pgTable(
  "worker_heartbeat",
  {
    id: serial("id").primaryKey(),
    lastTickAt: tstz("last_tick_at"),
    lastBackupAt: tstz("last_backup_at"),
    startedAt: tstz("started_at"),
    version: text("version"),
    scoringEnabled: boolean("scoring_enabled").notNull().default(false),
    lastScoringError: text("last_scoring_error"),
  },
  (t) => [check("worker_heartbeat_single_row", sql`${t.id} = 1`)],
);
