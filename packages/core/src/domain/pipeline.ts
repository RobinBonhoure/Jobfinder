import type { ApplicationStatus } from "./enums";

/** Délai de relance par défaut, en jours, selon le statut atteint. */
const FOLLOW_UP_DAYS: Partial<Record<ApplicationStatus, number>> = {
  applied: 7,
  followed_up: 10,
};

export const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
]);

/** Date (AAAA-MM-JJ) de la prochaine action, ou null si rien à relancer. */
export function nextActionFor(status: ApplicationStatus, from: Date = new Date()): string | null {
  const days = FOLLOW_UP_DAYS[status];
  if (days === undefined) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
