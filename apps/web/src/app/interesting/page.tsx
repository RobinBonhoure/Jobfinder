import { listClusters } from "@jobhunt/core/db";
import { JobTable } from "@/components/job-table";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function InterestingPage() {
  const rows = await listClusters({ triage: ["interested"], includeHidden: true });
  return (
    <>
      <PageHeader
        title="À postuler"
        subtitle="Offres marquées « intéressé ». Ouvre la fiche pour créer la candidature, ou appuie sur « a » une fois postulé."
      />
      {rows.length === 0 ? (
        <EmptyState title="Aucune offre en attente de candidature." />
      ) : (
        <JobTable rows={rows} />
      )}
    </>
  );
}
