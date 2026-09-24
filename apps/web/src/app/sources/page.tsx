import { databaseSizeBytes, listSourcesOverview, llmUsage30d } from "@jobhunt/core/db";
import { sourceKindLabel } from "@jobhunt/core/domain";
import { getAdapter } from "@jobhunt/core/sources";
import { deleteSourceAction, runSourceNowAction, seedSourcesAction } from "@/actions/sources";
import { ActionButton } from "@/components/action-button";
import { AddSourceForm, IntervalSelect, SourceToggle } from "@/components/source-controls";
import { Badge, Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { ago, llmCostUsd, until } from "@/lib/format";

export default async function SourcesPage() {
  const [rows, usage, dbSize] = await Promise.all([
    listSourcesOverview(),
    llmUsage30d(),
    databaseSizeBytes(),
  ]);
  const pollable = rows.filter((r) => r.source.kind !== "capture");
  const cost = llmCostUsd(usage.inputTokens, usage.outputTokens);

  return (
    <Page>
      <PageHeader
        title="Sources"
        subtitle={`${pollable.length} source(s) · LLM 30 j : ${usage.calls} score(s), ~${cost.toFixed(2)} $ · base ${(dbSize / 1e6).toFixed(1)} Mo`}
        actions={
          <ActionButton action={seedSourcesAction} title="Importe profile/boards.json (idempotent)">
            Importer boards.json
          </ActionButton>
        }
      />
      <Card title="Ajouter une entreprise par URL">
        <AddSourceForm />
      </Card>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
        {pollable.length === 0 ? (
          <EmptyState title="Aucune source.">
            Importe boards.json ou ajoute une entreprise par URL.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-2">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 font-semibold">Offres ouvertes</th>
                <th className="px-2 py-2 font-semibold">Retenues 30 j</th>
                <th className="px-2 py-2 font-semibold">Dernier succès</th>
                <th className="px-2 py-2 font-semibold">Prochain run</th>
                <th className="px-2 py-2 font-semibold">Fréquence</th>
                <th className="px-2 py-2 font-semibold">État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pollable.map(({ source: s, passed30d, open }) => {
                const min = getAdapter(s.kind)?.minIntervalMinutes ?? 60;
                const broken = s.consecutiveFailures >= 5;
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-xs text-ink-3">
                        <Badge>{sourceKindLabel[s.kind]}</Badge> <span className="font-mono">{s.id}</span>
                      </div>
                      {s.lastError && (
                        <div className={`mt-1 text-xs ${broken || !s.enabled ? "text-bad" : "text-warn"}`}>
                          {s.lastError}
                          {s.consecutiveFailures > 0 && ` (${s.consecutiveFailures} échec(s) consécutif(s))`}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">{open}</td>
                    <td className="px-2 py-2">
                      <span className={passed30d === 0 ? "text-ink-3" : "font-medium"}>{passed30d}</span>
                    </td>
                    <td className="px-2 py-2 text-xs">{ago(s.lastSuccessAt)}</td>
                    <td className="px-2 py-2 text-xs">{s.enabled ? until(s.nextRunAt) : "—"}</td>
                    <td className="px-2 py-2">
                      <IntervalSelect sourceId={s.id} value={s.intervalMinutes} min={min} />
                    </td>
                    <td className="px-2 py-2">
                      <SourceToggle sourceId={s.id} enabled={s.enabled} />
                      {s.runningSince && <div className="text-xs text-accent">en cours…</div>}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <ActionButton
                        action={runSourceNowAction.bind(null, s.id)}
                        variant="ghost"
                        pendingLabel="…"
                      >
                        Lancer
                      </ActionButton>
                      <ActionButton
                        action={deleteSourceAction.bind(null, s.id)}
                        variant="ghost"
                        confirm={`Supprimer ${s.id} et toutes ses annonces ?`}
                      >
                        Suppr.
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
