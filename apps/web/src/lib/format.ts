const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Paris",
});
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export const fmtDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? dateTimeFmt.format(new Date(d)) : "—";

export function ago(d: Date | string | null | undefined): string {
  if (!d) return "jamais";
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** « dans 3 h » / « dû depuis 10 min ». */
export function until(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return ago(d).replace("il y a", "dû depuis").replace("à l'instant", "maintenant");
  const min = Math.round(ms / 60_000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `dans ${h} h` : `dans ${Math.round(h / 24)} j`;
}

export function fmtSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (min && max) return `${k(min)}–${k(max)} €`;
  return `${k((min ?? max) as number)} €`;
}

export const isOverdue = (date: string | null) =>
  Boolean(date && date <= new Date().toISOString().slice(0, 10));

/** Coût indicatif en dollars (Haiku 4.5 : 1 $ / 5 $ par million de tokens). */
export const llmCostUsd = (input: number, output: number) => (input * 1 + output * 5) / 1_000_000;
