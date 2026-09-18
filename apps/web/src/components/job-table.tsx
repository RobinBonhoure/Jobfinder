"use client";

import type { ClusterListItem } from "@jobhunt/core/db";
import { contractLabel, remotePolicyLabel, remoteVerdictLabel, sourceKindLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setTriageAction } from "@/actions/jobs";
import { ago, fmtSalary } from "@/lib/format";
import { Badge, buttonClass, ScoreBadge } from "./ui";

type Row = Pick<
  ClusterListItem,
  | "clusterId"
  | "bestScore"
  | "scoreStatus"
  | "ruleScore"
  | "title"
  | "company"
  | "location"
  | "url"
  | "remotePolicy"
  | "contractType"
  | "firstSeenAt"
  | "remoteVerdict"
  | "justification"
  | "sourceKinds"
  | "salaryMin"
  | "salaryMax"
  | "previousClusterId"
  | "triage"
>;

/**
 * Tableau de tri avec raccourcis : j/k (naviguer), i (intéressé), x (écarté), a (postulé),
 * o (ouvrir l'annonce), Entrée (détail). Les lignes triées disparaissent immédiatement.
 */
export function JobTable({ rows, removeOnTriage = true }: { rows: Row[]; removeOnTriage?: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [visible, removeRow] = useOptimistic(rows, (state, id: string) =>
    state.filter((r) => r.clusterId !== id),
  );
  const [cursor, setCursor] = useState(0);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const triage = useCallback(
    (row: Row, value: "interested" | "dismissed" | "applied") => {
      setError(null);
      start(async () => {
        if (removeOnTriage) removeRow(row.clusterId);
        const res = await setTriageAction(row.clusterId, value);
        if (!res.ok) setError(res.message);
      });
    },
    [removeOnTriage, removeRow],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const row = visible[cursor];
      switch (e.key) {
        case "j":
          setCursor((c) => Math.min(c + 1, visible.length - 1));
          break;
        case "k":
          setCursor((c) => Math.max(c - 1, 0));
          break;
        case "i":
          if (row) triage(row, "interested");
          break;
        case "x":
          if (row) triage(row, "dismissed");
          break;
        case "a":
          if (row) triage(row, "applied");
          break;
        case "o":
          if (row) window.open(row.url, "_blank", "noopener");
          break;
        case "Enter":
          if (row) router.push(`/jobs/${row.clusterId}`);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, visible, triage, router]);

  useEffect(() => {
    if (cursor >= visible.length) setCursor(Math.max(0, visible.length - 1));
    rowRefs.current[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor, visible.length]);

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <p className="mb-2 text-xs text-zinc-500">
        Raccourcis : <kbd>j</kbd>/<kbd>k</kbd> naviguer · <kbd>i</kbd> intéressé · <kbd>x</kbd> écarter ·{" "}
        <kbd>a</kbd> postulé · <kbd>o</kbd> ouvrir l'annonce · <kbd>Entrée</kbd> détail
      </p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody>
            {visible.map((r, i) => {
              const salary = fmtSalary(r.salaryMin, r.salaryMax);
              return (
                <tr
                  key={r.clusterId}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  onClick={() => setCursor(i)}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800 ${
                    i === cursor ? "bg-sky-50 dark:bg-sky-950/40" : "bg-white dark:bg-zinc-900"
                  }`}
                >
                  <td className="w-14 px-3 py-2 align-top">
                    <ScoreBadge score={r.bestScore} status={r.scoreStatus} ruleScore={r.ruleScore} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Link href={`/jobs/${r.clusterId}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {r.company ?? "Entreprise ?"}
                      </span>
                      {r.location && <span>· {r.location}</span>}
                      <span>· {ago(r.firstSeenAt)}</span>
                    </div>
                    {r.justification && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {r.justification}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex max-w-64 flex-wrap justify-end gap-1">
                      {r.remoteVerdict ? (
                        <Badge tone={r.remoteVerdict === "full_remote_france_ok" ? "green" : "amber"}>
                          {remoteVerdictLabel[r.remoteVerdict]}
                        </Badge>
                      ) : (
                        <Badge tone={r.remotePolicy === "full_remote" ? "green" : "neutral"}>
                          {remotePolicyLabel[r.remotePolicy]}
                        </Badge>
                      )}
                      <Badge tone={r.contractType === "cdi" ? "green" : "neutral"}>
                        {contractLabel[r.contractType]}
                      </Badge>
                      {salary && <Badge tone="blue">{salary}</Badge>}
                      {r.previousClusterId && <Badge tone="violet">republiée</Badge>}
                      {r.sourceKinds.map((k) => (
                        <Badge key={k}>{sourceKindLabel[k] ?? k}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="w-40 px-3 py-2 text-right align-top whitespace-nowrap">
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      onClick={() => triage(r, "interested")}
                      title="i"
                    >
                      ★ Intéressé
                    </button>
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      onClick={() => triage(r, "dismissed")}
                      title="x"
                    >
                      ✕ Écarter
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
