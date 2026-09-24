import { type Fact, type ScoreLevel, scoreLevel, scoreLevelLabel } from "@jobhunt/core/domain";
import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-sel text-accent",
};

/** Pastille : réservée aux exceptions (alerte, statut), pas aux faits ordinaires. */
export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const LEVEL_TEXT: Record<ScoreLevel, string> = {
  excellent: "text-good",
  good: "text-ink",
  fair: "text-warn",
  weak: "text-ink-3",
};
const LEVEL_BAR: Record<ScoreLevel, string> = {
  excellent: "bg-good",
  good: "bg-ink-2",
  fair: "bg-warn",
  weak: "bg-ink-3",
};

/** Score : chiffre, niveau en toutes lettres et jauge. Pré-score en gris tant que le LLM n'est pas passé. */
export function ScoreBadge({
  score,
  status,
  ruleScore,
  size = "sm",
}: {
  score: number | null;
  status: string;
  ruleScore?: number;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  const box = `inline-flex shrink-0 flex-col items-center gap-1 ${lg ? "w-20" : "w-16"}`;
  const num = `font-mono font-semibold leading-none tabular-nums ${lg ? "text-3xl" : "text-lg"}`;
  const caption = "text-[0.75rem] leading-none text-ink-3";

  if (status === "failed") {
    return (
      <span className={box} title="Score indisponible (sortie LLM invalide)">
        <span className={`${num} text-bad`}>!</span>
        <span className={caption}>Échec</span>
      </span>
    );
  }
  const pending = status === "pending";
  const value = pending ? ruleScore : (score ?? ruleScore);
  if (value == null) {
    return (
      <span className={box} title="Score en attente">
        <span className={`${num} text-ink-3`}>…</span>
        <span className={caption}>En attente</span>
      </span>
    );
  }
  const level = scoreLevel(value);
  return (
    <span
      className={box}
      title={pending ? "Score LLM en attente — pré-score déterministe affiché" : `Score LLM : ${value}/100`}
    >
      <span className={`${num} ${pending ? "text-ink-3" : LEVEL_TEXT[level]}`}>{value}</span>
      <span className={caption}>{pending ? "Pré-score" : scoreLevelLabel[level]}</span>
      <span className={`h-1 overflow-hidden rounded-full bg-surface-2 ${lg ? "w-16" : "w-11"}`}>
        <span
          className={`block h-full ${pending ? "bg-line-strong" : LEVEL_BAR[level]}`}
          style={{ width: `${value}%` }}
        />
      </span>
    </span>
  );
}

const FACT_INLINE: Record<Fact["tone"], string> = {
  good: "",
  warn: "font-semibold text-warn",
  bad: "font-semibold text-bad",
};

/** Faits clés sur une ligne : neutres quand ils sont conformes, colorés quand ils posent problème. */
export function FactLine({ facts }: { facts: Array<Fact | string | null> }) {
  const items = facts.filter((f): f is Fact | string => Boolean(f));
  return (
    <span className="text-xs text-ink-3">
      {items.map((f, i) => {
        const fact = typeof f === "string" ? { label: f, tone: "good" as const } : f;
        return (
          <span key={fact.label}>
            {i > 0 && " · "}
            <span className={FACT_INLINE[fact.tone]}>{fact.label}</span>
          </span>
        );
      })}
    </span>
  );
}

const FACT_VALUE: Record<Fact["tone"] | "muted", string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  muted: "font-normal text-ink-3",
};

/** Grille label / valeur des faits clés d'une fiche. */
export function FactGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: Fact["tone"] | "muted" }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-0.5 bg-surface px-3 py-2">
          <dt className="eyebrow">{it.label}</dt>
          <dd className={`font-semibold ${it.tone ? FACT_VALUE[it.tone] : "text-ink"}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="eyebrow">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Section sans cadre d'une fiche : titre discret, contenu en pleine largeur. */
export function Section({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Bloc repliable (lettre, sources, outils) : garde la fiche courte sans rien cacher. */
export function Disclosure({
  title,
  children,
  open,
}: {
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 font-medium select-none [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-ink-2">{children}</div>}
    </div>
  );
}

/** Conteneur des pages « classiques » (hors vues liste + fiche). */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto space-y-5 px-8 py-6 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "warn" | "bad" | "info"; children: ReactNode }) {
  const styles = {
    warn: "border-warn/40 bg-warn-bg text-warn",
    bad: "border-bad/40 bg-bad-bg text-bad",
    info: "border-accent/30 bg-sel text-ink",
  }[tone];
  return <div className={`rounded-md border px-3 py-2 ${styles}`}>{children}</div>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
      {children}
    </a>
  );
}

export const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

const buttonBase =
  "inline-flex cursor-pointer items-center gap-2 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${buttonBase} border border-accent bg-accent px-3 py-1.5 text-accent-ink hover:border-accent-hover hover:bg-accent-hover`,
  secondary: `${buttonBase} border border-line-strong bg-surface px-3 py-1.5 text-ink hover:bg-surface-2`,
  danger: `${buttonBase} border border-bad/50 bg-surface px-3 py-1.5 text-bad hover:bg-bad-bg`,
  ghost: `${buttonBase} rounded px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink`,
} as const;
