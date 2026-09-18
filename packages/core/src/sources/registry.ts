import type { SourceKind } from "../domain/enums";
import { ashby } from "./ashby";
import { franceTravail } from "./france-travail";
import { greenhouse } from "./greenhouse";
import { jobicy } from "./jobicy";
import { lever } from "./lever";
import { recruitee } from "./recruitee";
import { smartrecruiters } from "./smartrecruiters";
import { teamtailor } from "./teamtailor";
import type { JobSource } from "./types";

export type PollableKind = Exclude<SourceKind, "capture">;

// Les adaptateurs sont typés finement ; le registre les manipule de façon générique.
const adapters = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  recruitee,
  teamtailor,
  france_travail: franceTravail,
  jobicy,
} satisfies Record<PollableKind, unknown>;

export function getAdapter(kind: SourceKind): JobSource<unknown, unknown> | null {
  if (kind === "capture") return null;
  return adapters[kind] as unknown as JobSource<unknown, unknown>;
}

export const ATS_KINDS = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "recruitee",
  "teamtailor",
] as const;
export type AtsKind = (typeof ATS_KINDS)[number];
