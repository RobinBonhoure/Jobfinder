"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  label,
  count,
  alert,
}: {
  href: string;
  label: string;
  /** Compteur affiché à droite ; `alert` le passe en rouge (quelque chose demande une action). */
  count?: number;
  alert?: boolean;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-md px-3 py-1.5 ${
        active ? "bg-surface-2 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <span>{label}</span>
      {count ? (
        <span
          className={`font-mono text-xs tabular-nums ${alert ? "rounded bg-bad-bg px-1.5 font-semibold text-bad" : "text-ink-3"}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
