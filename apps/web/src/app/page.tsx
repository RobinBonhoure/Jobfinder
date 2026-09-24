import { listClusters } from "@jobhunt/core/db";
import { SOURCE_KINDS, type SourceKind, sourceKindLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { runDueSourcesAction } from "@/actions/sources";
import { ActionButton } from "@/components/action-button";
import { TriageView } from "@/components/triage-view";
import { buttonClass, EmptyState, inputClass } from "@/components/ui";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const min = Number(one(sp.min)) || undefined;
  const age = Number(one(sp.age)) || undefined;
  const sourceParam = one(sp.source);
  const source = SOURCE_KINDS.includes(sourceParam as SourceKind) ? (sourceParam as SourceKind) : undefined;
  const hidden = one(sp.hidden) === "1";

  const rows = await listClusters({
    triage: ["new"],
    minScore: min,
    maxAgeDays: age,
    sourceKind: source,
    includeHidden: hidden,
  });

  const active = [
    min && `score ≥ ${min}`,
    age && `${age} j max.`,
    source && sourceKindLabel[source],
    hidden && "verdicts éliminatoires inclus",
  ].filter(Boolean);

  return (
    <TriageView
      rows={rows}
      selectedId={one(sp.sel)}
      title="Inbox"
      subtitle={`${rows.length} à trier`}
      actions={
        <ActionButton action={runDueSourcesAction} variant="ghost" pendingLabel="Ingestion…">
          Lancer les sources dues
        </ActionButton>
      }
      toolbar={
        <details className="group text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="font-medium">Filtres</span>
            {active.length > 0 ? (
              <span className="text-ink">{active.join(" · ")}</span>
            ) : (
              <span className="text-ink-3">aucun</span>
            )}
            <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <form className="mt-3 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-ink-3">Score min.</span>
              <input name="min" type="number" min={0} max={100} defaultValue={min} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-3">Âge max. (j)</span>
              <input name="age" type="number" min={1} defaultValue={age} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-3">Source</span>
              <select name="source" defaultValue={source ?? ""} className={inputClass}>
                <option value="">Toutes</option>
                {SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {sourceKindLabel[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-3 flex items-center gap-1.5 text-ink-2">
              <input type="checkbox" name="hidden" value="1" defaultChecked={hidden} />
              Inclure les verdicts éliminatoires
            </label>
            <div className="col-span-3 flex gap-2">
              <button type="submit" className={buttonClass.secondary}>
                Filtrer
              </button>
              <Link href="/" className={buttonClass.ghost}>
                Réinitialiser
              </Link>
            </div>
          </form>
        </details>
      }
      empty={
        <EmptyState title="Rien de neuf à trier.">
          Ajoute des entreprises dans{" "}
          <Link href="/sources" className="underline">
            Sources
          </Link>
          , capture une offre depuis l'extension, ou vérifie les{" "}
          <Link href="/rejected" className="underline">
            offres rejetées
          </Link>
          .
        </EmptyState>
      }
    />
  );
}
