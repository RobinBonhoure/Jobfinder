// Valeurs partagées entre le schéma DB (pgEnum), les schémas zod et l'UI.

export const REMOTE_POLICIES = ["full_remote", "hybrid", "onsite", "unknown"] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export const REMOTE_SCOPES = ["france", "europe", "worldwide", "other", "unknown"] as const;
export type RemoteScope = (typeof REMOTE_SCOPES)[number];

export const CONTRACT_TYPES = [
  "cdi",
  "cdd",
  "freelance",
  "internship",
  "apprenticeship",
  "other",
  "unknown",
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const SENIORITIES = ["junior", "mid", "senior", "lead", "unknown"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SOURCE_KINDS = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "recruitee",
  "teamtailor",
  "france_travail",
  "jobicy",
  "capture",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const FILTER_STATUSES = ["pending", "passed", "rejected"] as const;
export type FilterStatus = (typeof FILTER_STATUSES)[number];

export const TRIAGE_STATUSES = ["new", "interested", "dismissed", "applied"] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const SCORE_STATUSES = ["not_needed", "pending", "done", "failed"] as const;
export type ScoreStatus = (typeof SCORE_STATUSES)[number];

export const REMOTE_VERDICTS = [
  "full_remote_france_ok",
  "hybrid_or_onsite",
  "remote_but_geo_incompatible",
  "unclear",
] as const;
export type RemoteVerdict = (typeof REMOTE_VERDICTS)[number];

export const CONTRACT_VERDICTS = ["cdi", "not_cdi", "unclear"] as const;
export type ContractVerdict = (typeof CONTRACT_VERDICTS)[number];

export const RUN_STATUSES = ["running", "ok", "partial", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const APPLICATION_KINDS = ["job", "spontaneous"] as const;
export type ApplicationKind = (typeof APPLICATION_KINDS)[number];

export const APPLICATION_STATUSES = [
  "to_apply",
  "applied",
  "followed_up",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_EVENT_TYPES = [
  "status_change",
  "note",
  "sent",
  "follow_up",
  "interview_scheduled",
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export const OUTREACH_STATUSES = ["none", "to_contact", "contacted", "replied", "closed"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const CONTACT_KINDS = ["generic", "personal"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONSENT_BASES = [
  "b2b_legitimate_interest",
  "legitimate_interest_candidate",
  "explicit_consent",
] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];
