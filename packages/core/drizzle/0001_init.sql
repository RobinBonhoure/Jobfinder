CREATE TYPE "public"."application_event_type" AS ENUM('status_change', 'note', 'sent', 'follow_up', 'interview_scheduled');--> statement-breakpoint
CREATE TYPE "public"."application_kind" AS ENUM('job', 'spontaneous');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('to_apply', 'applied', 'followed_up', 'interview', 'offer', 'rejected', 'withdrawn', 'ghosted');--> statement-breakpoint
CREATE TYPE "public"."consent_basis" AS ENUM('b2b_legitimate_interest', 'legitimate_interest_candidate', 'explicit_consent');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('generic', 'personal');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('cdi', 'cdd', 'freelance', 'internship', 'apprenticeship', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."contract_verdict" AS ENUM('cdi', 'not_cdi', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."filter_status" AS ENUM('pending', 'passed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."llm_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('none', 'to_contact', 'contacted', 'replied', 'closed');--> statement-breakpoint
CREATE TYPE "public"."remote_policy" AS ENUM('full_remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."remote_scope" AS ENUM('france', 'europe', 'worldwide', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."remote_verdict" AS ENUM('full_remote_france_ok', 'hybrid_or_onsite', 'remote_but_geo_incompatible', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."score_status" AS ENUM('not_needed', 'pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."seniority" AS ENUM('junior', 'mid', 'senior', 'lead', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee', 'teamtailor', 'france_travail', 'jobicy', 'capture');--> statement-breakpoint
CREATE TYPE "public"."triage_status" AS ENUM('new', 'interested', 'dismissed', 'applied');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "application_event_type" NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status",
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "application_kind" NOT NULL,
	"cluster_id" uuid,
	"company_id" uuid,
	"contact_id" uuid,
	"external_url" text,
	"external_title" text,
	"external_company" text,
	"status" "application_status" DEFAULT 'to_apply' NOT NULL,
	"applied_at" timestamp with time zone,
	"next_action_at" date,
	"channel" text,
	"draft_subject" text,
	"draft_body" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_target" CHECK (("applications"."kind" = 'job' and ("applications"."cluster_id" is not null or "applications"."external_url" is not null))
        or ("applications"."kind" = 'spontaneous' and "applications"."company_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"domain" text,
	"website" text,
	"siren" char(9),
	"naf_code" text,
	"naf25_code" text,
	"headcount_range" text,
	"city" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"outreach_status" "outreach_status" DEFAULT 'none' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" "citext",
	"kind" "contact_kind" NOT NULL,
	"label" text,
	"source" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_basis" "consent_basis" NOT NULL,
	"mx_valid" boolean,
	"mx_checked_at" timestamp with time zone,
	"info_notice_sent_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_present" CHECK ("contacts"."deleted_at" is not null or "contacts"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "job_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_job_id" uuid,
	"company_id" uuid,
	"dedup_key" text NOT NULL,
	"title_norm" text NOT NULL,
	"triage" "triage_status" DEFAULT 'new' NOT NULL,
	"triaged_at" timestamp with time zone,
	"best_score" smallint,
	"score_status" "score_status" DEFAULT 'not_needed' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"previous_cluster_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"cluster_id" uuid,
	"company_id" uuid,
	"company_name_raw" text,
	"title" text NOT NULL,
	"title_norm" text NOT NULL,
	"url" text NOT NULL,
	"apply_url" text,
	"location_raw" text,
	"country_code" char(2),
	"remote_policy" "remote_policy" DEFAULT 'unknown' NOT NULL,
	"remote_scope" "remote_scope" DEFAULT 'unknown' NOT NULL,
	"contract_type" "contract_type" DEFAULT 'unknown' NOT NULL,
	"seniority" "seniority" DEFAULT 'unknown' NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"salary_raw" text,
	"description_text" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"published_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"content_hash" char(64) NOT NULL,
	"filter_status" "filter_status" DEFAULT 'pending' NOT NULL,
	"filter_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"filter_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"rule_score" smallint DEFAULT 0 NOT NULL,
	"forced_pass" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" char(64) NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"status" "llm_status" NOT NULL,
	"score" smallint,
	"justification" text,
	"matched_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"missing_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"red_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"hook" text,
	"remote_verdict" "remote_verdict",
	"contract_verdict" "contract_verdict",
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"closed" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"http_calls" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "source_kind" NOT NULL,
	"label" text NOT NULL,
	"company_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"interval_minutes" integer DEFAULT 360 NOT NULL,
	"next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cursor" jsonb,
	"running_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"id" serial PRIMARY KEY NOT NULL,
	"last_tick_at" timestamp with time zone,
	"last_backup_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"version" text,
	"scoring_enabled" boolean DEFAULT false NOT NULL,
	"last_scoring_error" text,
	CONSTRAINT "worker_heartbeat_single_row" CHECK ("worker_heartbeat"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cluster_id_job_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."job_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_clusters" ADD CONSTRAINT "job_clusters_canonical_job_id_jobs_id_fk" FOREIGN KEY ("canonical_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_clusters" ADD CONSTRAINT "job_clusters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_clusters" ADD CONSTRAINT "job_clusters_previous_cluster_id_job_clusters_id_fk" FOREIGN KEY ("previous_cluster_id") REFERENCES "public"."job_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cluster_id_job_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."job_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "applications_cluster_uq" ON "applications" USING btree ("cluster_id") WHERE "applications"."cluster_id" is not null;--> statement-breakpoint
CREATE INDEX "applications_status_next_idx" ON "applications" USING btree ("status","next_action_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_domain_uq" ON "companies" USING btree ("domain") WHERE "companies"."domain" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_siren_uq" ON "companies" USING btree ("siren") WHERE "companies"."siren" is not null;--> statement-breakpoint
CREATE INDEX "companies_name_norm_idx" ON "companies" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "companies_name_norm_trgm_idx" ON "companies" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "companies_outreach_idx" ON "companies" USING btree ("outreach_status");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_uq" ON "contacts" USING btree ("email") WHERE "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_clusters_triage_score_idx" ON "job_clusters" USING btree ("triage","best_score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_clusters_dedup_idx" ON "job_clusters" USING btree ("dedup_key","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_clusters_score_status_idx" ON "job_clusters" USING btree ("score_status");--> statement-breakpoint
CREATE INDEX "job_clusters_company_idx" ON "job_clusters" USING btree ("company_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_external_uq" ON "jobs" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "jobs_cluster_idx" ON "jobs" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "jobs_content_hash_idx" ON "jobs" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "jobs_filter_seen_idx" ON "jobs" USING btree ("filter_status","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_title_norm_trgm_idx" ON "jobs" USING gin ("title_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_company_seen_idx" ON "jobs" USING btree ("company_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "llm_scores_key_uq" ON "llm_scores" USING btree ("content_hash","prompt_version","model");--> statement-breakpoint
CREATE INDEX "source_runs_source_started_idx" ON "source_runs" USING btree ("source_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sources_due_idx" ON "sources" USING btree ("enabled","next_run_at");