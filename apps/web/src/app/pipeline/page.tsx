import { listPipeline, type PipelineRow } from "@jobhunt/core/db";
import { APPLICATION_STATUSES, applicationStatusLabel, CLOSED_STATUSES } from "@jobhunt/core/domain";
import Link from "next/link";
import { deleteApplicationAction } from "@/actions/applications";
import { ActionButton } from "@/components/action-button";
import { ExternalApplicationForm, NextActionInput, StatusSelect } from "@/components/application-controls";
import { Badge, Card, EmptyState, ExternalLink, PageHeader } from "@/components/ui";
import { fmtDate, isOverdue } from "@/lib/format";

function Row({ r }: { r: PipelineRow }) {
  const overdue = isOverdue(r.app.nextActionAt) && !CLOSED_STATUSES.has(r.app.status);
  const detailHref = r.app.clusterId
    ? `/jobs/${r.app.clusterId}`
    : r.app.companyId && r.app.kind === "spontaneous"
      ? `/companies/${r.app.companyId}`
      : null;
  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <td className="px-3 py-2 align-top">
        <div className="font-medium">
          {detailHref ? (
            <Link href={detailHref} className="hover:underline">
              {r.title ?? "Candidature spontanée"}
            </Link>
          ) : (
            (r.title ?? "—")
          )}
        </div>
        <div className="text-xs text-zinc-500">
          {r.company ?? "?"} {r.url && <ExternalLink href={r.url}>↗</ExternalLink>}{" "}
          {r.app.kind === "spontaneous" && <Badge tone="violet">spontanée</Badge>}
        </div>
      </td>
      <td className="px-2 py-2 align-top">
        <StatusSelect applicationId={r.app.id} status={r.app.status} />
      </td>
      <td className="px-2 py-2 align-top text-xs text-zinc-500">{fmtDate(r.app.appliedAt)}</td>
      <td className={`px-2 py-2 align-top ${overdue ? "rounded bg-red-50 dark:bg-red-950/40" : ""}`}>
        <NextActionInput applicationId={r.app.id} value={r.app.nextActionAt} />
        {overdue && <div className="text-xs font-medium text-red-700">relance due</div>}
      </td>
      <td className="max-w-xs px-2 py-2 align-top text-xs text-zinc-600 dark:text-zinc-400">
        <p className="line-clamp-3 whitespace-pre-line">{r.app.notes}</p>
      </td>
      <td className="px-2 py-2 text-right align-top">
        <ActionButton
          action={deleteApplicationAction.bind(null, r.app.id)}
          variant="ghost"
          confirm="Supprimer cette candidature et son historique ?"
        >
          Supprimer
        </ActionButton>
      </td>
    </tr>
  );
}

export default async function PipelinePage() {
  const rows = await listPipeline();
  const groups = APPLICATION_STATUSES.map((s) => ({
    status: s,
    rows: rows.filter((r) => r.app.status === s),
  })).filter((g) => g.rows.length > 0);
  const due = rows.filter((r) => isOverdue(r.app.nextActionAt) && !CLOSED_STATUSES.has(r.app.status)).length;

  return (
    <>
      <PageHeader
        title="Candidatures"
        subtitle={`${rows.length} candidature(s) · ${due} relance(s) due(s)`}
      />
      <Card title="Ajouter une candidature faite hors outil">
        <ExternalApplicationForm />
      </Card>
      <div className="mt-5 space-y-5">
        {groups.length === 0 && <EmptyState title="Aucune candidature pour l'instant." />}
        {groups.map((g) => (
          <section key={g.status}>
            <h2 className="mb-2 text-sm font-semibold">
              {applicationStatusLabel[g.status]} <span className="text-zinc-500">({g.rows.length})</span>
            </h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="px-3 py-1.5 font-medium">Offre</th>
                    <th className="px-2 py-1.5 font-medium">Statut</th>
                    <th className="px-2 py-1.5 font-medium">Postulé</th>
                    <th className="px-2 py-1.5 font-medium">Relance</th>
                    <th className="px-2 py-1.5 font-medium">Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <Row key={r.app.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
