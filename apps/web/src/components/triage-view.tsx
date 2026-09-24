import { type ClusterListItem, getClusterDetail } from "@jobhunt/core/db";
import type { ReactNode } from "react";
import { JobDetail } from "./job-detail";
import { JobList } from "./job-list";

/**
 * Vue de tri liste + fiche : la liste à gauche, la fiche de l'offre sélectionnée (`?sel=`) à droite.
 * Sans sélection valide, la première offre est affichée.
 */
export async function TriageView({
  rows,
  selectedId,
  title,
  subtitle,
  actions,
  toolbar,
  empty,
}: {
  rows: ClusterListItem[];
  selectedId: string | undefined;
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  empty: ReactNode;
}) {
  const index = Math.max(
    0,
    rows.findIndex((r) => r.clusterId === selectedId),
  );
  const selected = rows[index];
  const detail = selected ? await getClusterDetail(selected.clusterId) : null;
  const next = rows[index + 1] ?? rows[index - 1];

  return (
    <div className="grid h-full grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
      <section className="flex min-h-0 flex-col border-r border-line bg-surface">
        <header className="space-y-2 border-b border-line px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <span className="text-xs text-ink-3">{subtitle}</span>
            </div>
            {actions}
          </div>
          {toolbar}
        </header>
        {selected ? (
          <JobList rows={rows} selectedId={selected.clusterId} />
        ) : (
          <div className="p-4">{empty}</div>
        )}
      </section>
      <section key={selected?.clusterId ?? "none"} className="min-h-0 overflow-y-auto">
        {detail ? (
          <JobDetail detail={detail} nextId={next?.clusterId ?? null} />
        ) : (
          <p className="p-8 text-ink-3">Sélectionne une offre dans la liste.</p>
        )}
      </section>
    </div>
  );
}
