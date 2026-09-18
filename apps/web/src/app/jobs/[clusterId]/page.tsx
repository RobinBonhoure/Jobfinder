import { getClusterDetail, listMergeCandidates } from "@jobhunt/core/db";
import {
  applicationStatusLabel,
  contractLabel,
  filterFlagLabel,
  filterReasonLabel,
  remotePolicyLabel,
  remoteVerdictLabel,
  sourceKindLabel,
  triageLabel,
} from "@jobhunt/core/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createApplicationAction } from "@/actions/applications";
import { promoteCompanyAction, rescoreAction, rescueAction, setTriageAction } from "@/actions/jobs";
import { ActionButton } from "@/components/action-button";
import { NextActionInput, NoteForm, StatusSelect } from "@/components/application-controls";
import { CopyButton } from "@/components/copy-button";
import { MergeForm } from "@/components/merge-form";
import { Badge, Banner, Card, ExternalLink, ScoreBadge } from "@/components/ui";
import { ago, fmtDate, fmtSalary } from "@/lib/format";

export default async function JobPage({ params }: PageProps<"/jobs/[clusterId]">) {
  const { clusterId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clusterId)) notFound();
  const detail = await getClusterDetail(clusterId);
  if (!detail?.canonical) notFound();
  const { cluster, canonical, members, score, application } = detail;
  const job = canonical.job;
  const candidates = await listMergeCandidates(clusterId);
  const salary = fmtSalary(job.salaryMin, job.salaryMax) ?? job.salaryRaw;
  const rejected = members.every((m) => m.job.filterStatus === "rejected");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Inbox
          </Link>
          <div className="mt-2 flex items-start gap-3">
            <ScoreBadge score={cluster.bestScore} status={cluster.scoreStatus} ruleScore={job.ruleScore} />
            <div>
              <h1 className="text-xl font-semibold">{job.title}</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {job.companyNameRaw ?? "Entreprise inconnue"} · {job.locationRaw ?? "localisation ?"} · vue{" "}
                {ago(cluster.firstSeenAt)}
                {job.publishedAt && ` · publiée le ${fmtDate(job.publishedAt)}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge tone={job.remotePolicy === "full_remote" ? "green" : "neutral"}>
                  {remotePolicyLabel[job.remotePolicy]}
                </Badge>
                <Badge tone={job.contractType === "cdi" ? "green" : "neutral"}>
                  {contractLabel[job.contractType]}
                </Badge>
                {salary && <Badge tone="blue">{salary}</Badge>}
                <Badge>{triageLabel[cluster.triage]}</Badge>
                {cluster.closedAt && <Badge tone="red">close {ago(cluster.closedAt)}</Badge>}
                {cluster.previousClusterId && (
                  <Link href={`/jobs/${cluster.previousClusterId}`}>
                    <Badge tone="violet">déjà vue — voir l'ancienne</Badge>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={job.applyUrl ?? job.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Ouvrir l'annonce ↗
          </a>
          <ActionButton action={setTriageAction.bind(null, clusterId, "interested")}>
            ★ Intéressé
          </ActionButton>
          <ActionButton action={setTriageAction.bind(null, clusterId, "dismissed")}>✕ Écarter</ActionButton>
          {!application && (
            <ActionButton action={createApplicationAction.bind(null, clusterId, "applied")} variant="primary">
              J'ai postulé
            </ActionButton>
          )}
          {rejected && (
            <ActionButton
              action={rescueAction.bind(null, clusterId)}
              success="Repêchée et envoyée au scoring"
            >
              Repêcher
            </ActionButton>
          )}
        </div>

        {(canonical.job.filterReasons.length > 0 || canonical.job.filterFlags.length > 0) && (
          <Banner tone={rejected ? "red" : "amber"}>
            {canonical.job.filterReasons.length > 0 && (
              <p>
                {rejected ? "Rejetée par le filtre" : "Motifs signalés (mode conseil)"} :{" "}
                {canonical.job.filterReasons.map(filterReasonLabel).join(" · ")}
              </p>
            )}
            {canonical.job.filterFlags.length > 0 && (
              <p className="text-xs opacity-80">
                À vérifier : {canonical.job.filterFlags.map(filterFlagLabel).join(" · ")}
              </p>
            )}
          </Banner>
        )}

        <Card title="Description">
          <div className="prose-job">{job.descriptionText || "Description non disponible."}</div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card
          title="Analyse"
          actions={
            <ActionButton
              action={rescoreAction.bind(null, clusterId)}
              variant="ghost"
              pendingLabel="Scoring…"
            >
              Rescorer
            </ActionButton>
          }
        >
          {score?.status === "ok" ? (
            <div className="space-y-3 text-sm">
              <p>{score.justification}</p>
              <div className="flex flex-wrap gap-1">
                {score.remoteVerdict && (
                  <Badge tone={score.remoteVerdict === "full_remote_france_ok" ? "green" : "amber"}>
                    {remoteVerdictLabel[score.remoteVerdict]}
                  </Badge>
                )}
                {score.contractVerdict && (
                  <Badge tone={score.contractVerdict === "cdi" ? "green" : "amber"}>
                    contrat : {score.contractVerdict}
                  </Badge>
                )}
              </div>
              {score.matchedSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500">Compétences alignées</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {score.matchedSkills.map((s) => (
                      <Badge key={s} tone="green">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {score.missingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500">Compétences manquantes</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {score.missingSkills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {score.redFlags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500">Red flags</p>
                  <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-400">
                    {score.redFlags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {score.hook && (
                <div className="rounded-md bg-sky-50 p-2 dark:bg-sky-950/50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-sky-800 dark:text-sky-300">Accroche</p>
                    <CopyButton text={score.hook} />
                  </div>
                  <p className="mt-1">{score.hook}</p>
                </div>
              )}
            </div>
          ) : score?.status === "failed" ? (
            <p className="text-sm text-red-700">Score indisponible : {score.error ?? "sortie invalide"}.</p>
          ) : cluster.scoreStatus === "pending" ? (
            <p className="text-sm text-zinc-500">
              Score en attente (prochaine fenêtre du worker ou « Rescorer »).
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Pas de scoring : offre rejetée par le filtre.</p>
          )}
        </Card>

        {application && (
          <Card title="Candidature">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusSelect applicationId={application.id} status={application.status} />
                <span className="text-xs text-zinc-500">Relance</span>
                <NextActionInput applicationId={application.id} value={application.nextActionAt} />
              </div>
              <p className="text-xs text-zinc-500">
                {applicationStatusLabel[application.status]}
                {application.appliedAt && ` depuis le ${fmtDate(application.appliedAt)}`}
              </p>
              {application.notes && <p className="prose-job text-xs">{application.notes}</p>}
              <NoteForm applicationId={application.id} />
            </div>
          </Card>
        )}

        <Card title={`Sources (${members.length})`}>
          <ul className="space-y-1.5 text-sm">
            {members.map((m) => (
              <li key={m.job.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <Badge>{sourceKindLabel[m.sourceKind]}</Badge>{" "}
                  <ExternalLink href={m.job.url}>{m.sourceLabel}</ExternalLink>
                  {m.job.id === canonical.job.id && (
                    <span className="ml-1 text-xs text-zinc-500">(principale)</span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">
                  {m.job.closedAt ? "close" : ago(m.job.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
          {canonical.sourceKind === "jobicy" && (
            <p className="mt-2 text-xs text-zinc-500">
              Offre fournie par Jobicy (jobicy.com) — postuler via l'URL d'origine.
            </p>
          )}
        </Card>

        <Card title="Outils">
          <div className="space-y-3">
            <MergeForm clusterId={clusterId} candidates={candidates} />
            <ActionButton
              action={promoteCompanyAction.bind(null, clusterId)}
              variant="ghost"
              success="Entreprise ajoutée aux cibles spontanées"
            >
              + Cible de candidature spontanée
            </ActionButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
