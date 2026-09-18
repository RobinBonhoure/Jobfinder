import type { SalaryRange } from "../domain/job";

const toNumber = (s: string) => Number(s.replace(/[\s  ]/g, "").replace(",", "."));

/** Convertit une valeur en euros bruts annuels si l'unité est reconnaissable. */
function annualize(value: number, hasK: boolean): number {
  const v = hasK ? value * 1000 : value;
  return Math.round(v);
}

/**
 * Formats reconnus : « 45k-55k€ », « 45 000 € - 55 000 € », « Annuel de 45000.00 Euros à 55000.00 Euros »,
 * « 50K€ ». Seuls les montants plausibles pour un salaire annuel (15 k – 300 k) sont retenus.
 */
export function parseSalary(raw: string | null | undefined): SalaryRange | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  if (/\b(mensuel|monthly|par mois|\/ ?mois|horaire|hourly|\/ ?h\b|jour|daily|tjm)\b/i.test(text)) {
    return { min: null, max: null, raw: text };
  }
  const re = /(\d{1,3}(?:[\s  .]\d{3})+|\d+(?:[.,]\d+)?)\s*(k)?/gi;
  const values: number[] = [];
  for (const m of text.matchAll(re)) {
    const numStr = m[1] ?? "";
    const hasK = Boolean(m[2]);
    const cleaned = /^\d{1,3}(?:[.]\d{3})+$/.test(numStr) ? numStr.replace(/\./g, "") : numStr;
    const n = annualize(toNumber(cleaned), hasK);
    if (n >= 15_000 && n <= 300_000) values.push(n);
  }
  if (values.length === 0) return { min: null, max: null, raw: text };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: max === min ? null : max, raw: text };
}

/** Pour les sources qui fournissent min/max numériques. */
export function salaryFromNumbers(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  period: string | null | undefined,
): SalaryRange | null {
  if (min == null && max == null) return null;
  const raw =
    [min, max].filter((v) => v != null).join(" – ") + ` ${currency ?? ""} ${period ?? ""}`.trimEnd();
  const isEurYear =
    (!currency || currency.toUpperCase() === "EUR") && (!period || /year|annual|an/i.test(period));
  if (!isEurYear) return { min: null, max: null, raw: raw.trim() };
  return {
    min: min != null ? Math.round(min) : null,
    max: max != null ? Math.round(max) : null,
    raw: raw.trim(),
  };
}
