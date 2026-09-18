import { listRejected } from "@jobhunt/core/db";
import { filterReasonLabel, remoteVerdictLabel, sourceKindLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { rescueAction } from "@/actions/jobs";
import { refilterAction } from "@/actions/sources";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, ExternalLink, PageHeader } from "@/components/ui";

export default async function RejectedPage({ searchParams }: PageProps<"/rejected">) {
  const sp = await searchParams;
  const days = Math.min(Number(sp.days) || 7, 60);
  const { filtered, byLlm } = await listRejected(days);

  // Regroupement par premier motif ; les offres « presque bonnes » (un seul motif) d'abord.
  const groups = new Map<string, typeof filtered>();
  for (const job of filtered) {
    const key = job.reasons[0]?.split(":")[0] ?? "autre";
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  const nearMisses = filtered.filter((j) => j.reasons.length === 1 && !j.reasons[0]?.startsWith("role"));

  return (
    <>
      <PageHeader
        title="Rejetées"
        subtitle={`Audit du filtre sur ${days} jours : ${filtered.length} rejetée(s) par le filtre, ${byLlm.length} masquée(s) par le LLM`}
        actions={
          <>
            <Link href={`/rejected?days=${days === 7 ? 30 : 7}`} className="text-xs underline">
              {days === 7 ? "Voir 30 jours" : "Voir 7 jours"}
            </Link>
            <ActionButton action={refilterAction} title="Après modification de profile/criteria.json">
              Réappliquer le filtre
            </ActionButton>
          </>
        }
      />
      <div className="space-y-5">
        <Card title={`Masquées par le LLM (${byLlm.length})`}>
          {byLlm.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {byLlm.map((j) => (
                <li key={j.clusterId} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/jobs/${j.clusterId}`} className="font-medium hover:underline">
                      {j.title}
                    </Link>{" "}
                    <span className="text-xs text-zinc-500">
                      {j.company} · {j.location}
                    </span>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{j.justification}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {j.remoteVerdict && j.remoteVerdict !== "full_remote_france_ok" && (
                      <Badge tone="amber">{remoteVerdictLabel[j.remoteVerdict]}</Badge>
                    )}
                    {j.contractVerdict === "not_cdi" && <Badge tone="amber">pas un CDI</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Presque retenues : un seul motif (${nearMisses.length})`}>
          {nearMisses.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {nearMisses.slice(0, 100).map((j) => (
                <li key={`${j.clusterId}-${j.url}`} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <ExternalLink href={j.url}>{j.title}</ExternalLink>{" "}
                    <span className="text-xs text-zinc-500">
                      {j.company} · {j.location} · {sourceKindLabel[j.sourceKind]}
                    </span>
                    <div className="mt-0.5">
                      <Badge tone="red">{filterReasonLabel(j.reasons[0] ?? "")}</Badge>
                    </div>
                  </div>
                  {j.clusterId && (
                    <ActionButton
                      action={rescueAction.bind(null, j.clusterId)}
                      variant="ghost"
                      success="Repêchée"
                    >
                      Repêcher
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Répartition des motifs">
          {filtered.length === 0 ? (
            <EmptyState title="Aucune offre rejetée sur la période." />
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {[...groups.entries()]
                .sort((a, b) => b[1].length - a[1].length)
                .map(([key, jobs]) => (
                  <li
                    key={key}
                    className="flex justify-between rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/50"
                  >
                    <span>{filterReasonLabel(key)}</span>
                    <span className="text-zinc-500">{jobs.length}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
