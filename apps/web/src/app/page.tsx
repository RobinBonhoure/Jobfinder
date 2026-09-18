import { listClusters } from "@jobhunt/core/db";
import { SOURCE_KINDS, type SourceKind, sourceKindLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { runDueSourcesAction } from "@/actions/sources";
import { ActionButton } from "@/components/action-button";
import { JobTable } from "@/components/job-table";
import { buttonClass, EmptyState, inputClass, PageHeader } from "@/components/ui";

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

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={`${rows.length} offre(s) à trier`}
        actions={
          <ActionButton action={runDueSourcesAction} pendingLabel="Ingestion…">
            Lancer les sources dues
          </ActionButton>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Score min.</span>
          <input
            name="min"
            type="number"
            min={0}
            max={100}
            defaultValue={min}
            className={`${inputClass} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Âge max. (jours)</span>
          <input name="age" type="number" min={1} defaultValue={age} className={`${inputClass} w-28`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Source</span>
          <select name="source" defaultValue={source ?? ""} className={`${inputClass} w-40`}>
            <option value="">Toutes</option>
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {sourceKindLabel[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" name="hidden" value="1" defaultChecked={hidden} />
          <span className="text-xs">inclure les verdicts éliminatoires</span>
        </label>
        <button type="submit" className={buttonClass.secondary}>
          Filtrer
        </button>
        <Link href="/" className={buttonClass.ghost}>
          Réinitialiser
        </Link>
      </form>
      {rows.length === 0 ? (
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
      ) : (
        <JobTable rows={rows} />
      )}
    </>
  );
}
