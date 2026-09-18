import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({
  score,
  status,
  ruleScore,
}: {
  score: number | null;
  status: string;
  ruleScore?: number;
}) {
  if (status === "pending") {
    return (
      <span
        className="inline-flex flex-col items-center"
        title="Score LLM en attente — pré-score déterministe affiché"
      >
        <span className="inline-flex h-8 w-10 items-center justify-center rounded border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-600">
          {ruleScore ?? "…"}
        </span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        title="Score indisponible (sortie LLM invalide)"
        className="inline-flex h-8 w-10 items-center justify-center rounded bg-red-100 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-300"
      >
        !
      </span>
    );
  }
  const s = score ?? ruleScore ?? 0;
  const tone =
    s >= 80
      ? "bg-emerald-600 text-white"
      : s >= 65
        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
        : s >= 50
          ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex h-8 w-10 items-center justify-center rounded text-sm font-semibold ${tone}`}
    >
      {s}
    </span>
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
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-500">{children}</div>}
    </div>
  );
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "amber" | "red" | "blue"; children: ReactNode }) {
  const styles = {
    amber:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
    red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    blue: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  }[tone];
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-sky-700 hover:underline dark:text-sky-400"
    >
      {children}
    </a>
  );
}

export function NavLink({
  href,
  label,
  count,
  alert,
}: {
  href: string;
  label: string;
  count?: number;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <span>{label}</span>
      {count ? (
        <span
          className={`rounded-full px-1.5 text-xs ${alert ? "bg-red-600 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-sky-900";

export const buttonClass = {
  primary:
    "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondary:
    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
  danger:
    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300",
  ghost:
    "inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800",
} as const;
