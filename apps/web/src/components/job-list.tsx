"use client";

import type { ClusterListItem } from "@jobhunt/core/db";
import { contractFact, remoteFact } from "@jobhunt/core/domain";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setTriageAction } from "@/actions/jobs";
import { ago, fmtSalary } from "@/lib/format";
import { useSelectJob } from "@/lib/use-select-job";
import { Badge, FactLine, ScoreBadge } from "./ui";

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
  | "contractVerdict"
  | "justification"
  | "salaryMin"
  | "salaryMax"
  | "previousClusterId"
>;

type Triage = "interested" | "dismissed" | "applied";

/**
 * Liste de tri : la ligne sélectionnée s'affiche dans le panneau voisin.
 * Raccourcis : j/k (naviguer), i (intéressé), x (écarté), a (postulé), o (ouvrir l'annonce),
 * Entrée (fiche pleine page). Une ligne triée disparaît et la sélection passe à la suivante.
 */
export function JobList({ rows, selectedId }: { rows: Row[]; selectedId: string | null }) {
  const router = useRouter();
  const select = useSelectJob();
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [visible, removeRow] = useOptimistic(rows, (state, id: string) =>
    state.filter((r) => r.clusterId !== id),
  );
  // Sélection locale pour un surlignage immédiat ; l'URL (donc la fiche) suit.
  const [current, setCurrent] = useState(selectedId);
  useEffect(() => setCurrent(selectedId), [selectedId]);
  const cursor = Math.max(
    0,
    visible.findIndex((r) => r.clusterId === current),
  );
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const moveTo = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      setCurrent(row.clusterId);
      start(() => select(row.clusterId));
    },
    [select],
  );

  const triage = useCallback(
    (row: Row, value: Triage) => {
      setError(null);
      const i = visible.findIndex((r) => r.clusterId === row.clusterId);
      const next = visible[i + 1] ?? visible[i - 1];
      setCurrent(next?.clusterId ?? null);
      start(async () => {
        removeRow(row.clusterId);
        select(next?.clusterId ?? null);
        const res = await setTriageAction(row.clusterId, value);
        if (!res.ok) setError(res.message);
      });
    },
    [visible, removeRow, select],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const row = visible[cursor];
      switch (e.key) {
        case "j":
          moveTo(visible[cursor + 1]);
          break;
        case "k":
          moveTo(visible[cursor - 1]);
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
          // Entrée garde son sens natif sur les autres boutons et liens (panneau de détail).
          if (row && (target === document.body || target?.closest("[data-job-row]")))
            router.push(`/jobs/${row.clusterId}`);
          else return;
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, visible, triage, moveTo, router]);

  const currentId = visible[cursor]?.clusterId;
  useEffect(() => {
    if (currentId) rowRefs.current.get(currentId)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <p className="border-b border-line bg-bad-bg px-4 py-2 text-xs text-bad">{error}</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((r, i) => {
          const selected = i === cursor;
          return (
            <li key={r.clusterId} className="border-b border-line">
              <button
                type="button"
                data-job-row
                ref={(el) => {
                  if (el) rowRefs.current.set(r.clusterId, el);
                  else rowRefs.current.delete(r.clusterId);
                }}
                aria-current={selected || undefined}
                onClick={() => moveTo(r)}
                onDoubleClick={() => router.push(`/jobs/${r.clusterId}`)}
                className={`grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 text-left outline-offset-[-2px] ${
                  selected ? "bg-sel shadow-[inset_0_0_0_1px_var(--accent)]" : "hover:bg-surface-2"
                }`}
              >
                <ScoreBadge score={r.bestScore} status={r.scoreStatus} ruleScore={r.ruleScore} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="leading-snug font-semibold text-ink">{r.title}</span>
                  {/* Une seule ligne : certaines offres listent dix pays ; le détail complet est dans la fiche. */}
                  <span className="line-clamp-1 text-xs text-ink-2" title={r.location ?? undefined}>
                    <span className="font-semibold text-ink">{r.company ?? "Entreprise ?"}</span> ·{" "}
                    {ago(r.firstSeenAt)}
                    {r.location && ` · ${r.location}`}
                  </span>
                  <FactLine
                    facts={[
                      contractFact(r.contractType, r.contractVerdict),
                      remoteFact(r.remotePolicy, r.remoteVerdict),
                      fmtSalary(r.salaryMin, r.salaryMax),
                    ]}
                  />
                  {r.justification && (
                    <span className="mt-0.5 line-clamp-2 text-xs text-ink-2">{r.justification}</span>
                  )}
                  {r.previousClusterId && (
                    <span className="mt-1">
                      <Badge tone="info">Republiée</Badge>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line bg-surface px-4 py-2 text-xs text-ink-3">
        <kbd>j</kbd> <kbd>k</kbd> naviguer · <kbd>i</kbd> intéressé · <kbd>x</kbd> écarter · <kbd>a</kbd>{" "}
        postulé · <kbd>o</kbd> annonce · <kbd>↵</kbd> pleine page
      </p>
    </div>
  );
}
