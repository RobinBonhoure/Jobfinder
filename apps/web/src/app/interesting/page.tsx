import { listClusters } from "@jobhunt/core/db";
import { TriageView } from "@/components/triage-view";
import { EmptyState } from "@/components/ui";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InterestingPage({ searchParams }: PageProps<"/interesting">) {
  const sp = await searchParams;
  const rows = await listClusters({ triage: ["interested"], includeHidden: true });
  return (
    <TriageView
      rows={rows}
      selectedId={one(sp.sel)}
      title="À postuler"
      subtitle={`${rows.length} offre(s) marquée(s) « intéressé »`}
      toolbar={
        <p className="text-xs text-ink-3">
          Prépare la lettre dans la fiche, puis appuie sur <kbd>a</kbd> une fois postulé.
        </p>
      }
      empty={<EmptyState title="Aucune offre en attente de candidature." />}
    />
  );
}
