import { type ClusterDetail, listMergeCandidates } from "@jobhunt/core/db";
import {
  applicationStatusLabel,
  contractFact,
  filterFlagLabel,
  filterReasonLabel,
  remoteFact,
  sourceKindLabel,
} from "@jobhunt/core/domain";
import Link from "next/link";
import { promoteCompanyAction, rescoreAction, rescueAction } from "@/actions/jobs";
import { ago, fmtDate, fmtSalary } from "@/lib/format";
import { ActionButton } from "./action-button";
import { NextActionInput, NoteForm, StatusSelect } from "./application-controls";
import { CopyButton } from "./copy-button";
import { CoverLetter } from "./cover-letter";
import { MergeForm } from "./merge-form";
import { TriageButtons } from "./triage-buttons";
import { Badge, Banner, Disclosure, ExternalLink, FactGrid, ScoreBadge, Section } from "./ui";

/**
 * Fiche d'une offre, dans l'ordre de la décision : verdict, faits clés, actions, analyse,
 * description ; lettre, sources et outils repliés. Partagée par le panneau de tri et /jobs/[id].
 * `nextId` : offre à sélectionner après un tri (vue liste + fiche uniquement).
 */
export async function JobDetail({ detail, nextId }: { detail: ClusterDetail; nextId?: string | null }) {
  const { cluster, canonical, members, score, application } = detail;
  if (!canonical) return null;
  const job = canonical.job;
  const clusterId = cluster.id;
  const candidates = await listMergeCandidates(clusterId);
  const salary = fmtSalary(job.salaryMin, job.salaryMax) ?? job.salaryRaw;
  const rejected = members.every((m) => m.job.filterStatus === "rejected");
  const contract = contractFact(job.contractType, score?.contractVerdict);
  const remote = remoteFact(job.remotePolicy, score?.remoteVerdict);
  const inList = nextId !== undefined;

  return (
    <article className="mx-auto max-w-3xl space-y-6 px-8 py-6">
      <header className="flex items-start gap-4">
        <ScoreBadge
          size="lg"
          score={cluster.bestScore}
          status={cluster.scoreStatus}
          ruleScore={job.ruleScore}
        />
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{job.title}</h1>
          <p className="text-ink-2">
            <span className="font-semibold text-ink">{job.companyNameRaw ?? "Entreprise inconnue"}</span> ·{" "}
            {job.locationRaw ?? "localisation ?"} · vue {ago(cluster.firstSeenAt)}
            {job.publishedAt && ` · publiée le ${fmtDate(job.publishedAt)}`}
          </p>
          {(cluster.closedAt || cluster.previousClusterId || inList) && (
            <p className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {cluster.closedAt && <Badge tone="bad">Close {ago(cluster.closedAt)}</Badge>}
              {cluster.previousClusterId && (
                <Link href={`/jobs/${cluster.previousClusterId}`}>
                  <Badge tone="info">Republiée — voir l'ancienne</Badge>
                </Link>
              )}
              {inList && (
                <Link href={`/jobs/${clusterId}`} className="text-ink-3 hover:text-ink hover:underline">
                  Ouvrir en pleine page
                </Link>
              )}
            </p>
          )}
        </div>
      </header>

      <FactGrid
        items={[
          { label: "Contrat", value: contract.label, tone: contract.tone },
          { label: "Télétravail", value: remote.label, tone: remote.tone },
          { label: "Salaire", value: salary ?? "Non communiqué", tone: salary ? undefined : "muted" },
          {
            label: members.length > 1 ? `Sources (${members.length})` : "Source",
            value: sourceKindLabel[canonical.sourceKind],
          },
        ]}
      />

      <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-2 bg-canvas px-2 py-2">
        <a
          href={job.applyUrl ?? job.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-accent bg-accent px-3 py-1.5 font-medium text-accent-ink hover:bg-accent-hover"
        >
          Ouvrir l'annonce ↗{inList && <kbd>o</kbd>}
        </a>
        <TriageButtons clusterId={clusterId} triage={cluster.triage} nextId={nextId} />
        {rejected && (
          <ActionButton action={rescueAction.bind(null, clusterId)} success="Repêchée et envoyée au scoring">
            Repêcher
          </ActionButton>
        )}
      </div>

      {(job.filterReasons.length > 0 || job.filterFlags.length > 0) && (
        <Banner tone={rejected ? "bad" : "warn"}>
          {job.filterReasons.length > 0 && (
            <p>
              {rejected ? "Rejetée par le filtre" : "Motifs signalés (mode conseil)"} :{" "}
              {job.filterReasons.map(filterReasonLabel).join(" · ")}
            </p>
          )}
          {job.filterFlags.length > 0 && (
            <p className="text-xs">À vérifier : {job.filterFlags.map(filterFlagLabel).join(" · ")}</p>
          )}
        </Banner>
      )}

      {application && (
        <Section title="Candidature">
          <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusSelect applicationId={application.id} status={application.status} />
              <span className="text-xs text-ink-3">Relance</span>
              <NextActionInput applicationId={application.id} value={application.nextActionAt} />
              <span className="text-xs text-ink-3">
                {applicationStatusLabel[application.status]}
                {application.appliedAt && ` depuis le ${fmtDate(application.appliedAt)}`}
              </span>
            </div>
            {application.notes && <p className="prose-job text-sm">{application.notes}</p>}
            <NoteForm applicationId={application.id} />
          </div>
        </Section>
      )}

      <Section
        title="Pourquoi ce score"
        actions={
          <ActionButton action={rescoreAction.bind(null, clusterId)} variant="ghost" pendingLabel="Scoring…">
            Rescorer
          </ActionButton>
        }
      >
        {score?.status === "ok" ? (
          <div className="space-y-4">
            <p className="max-w-[68ch] text-[1.02rem] leading-relaxed">{score.justification}</p>
            {(score.matchedSkills.length > 0 || score.missingSkills.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SkillList
                  title="Compétences alignées"
                  items={score.matchedSkills}
                  mark="✓"
                  tone="text-good"
                />
                <SkillList title="À renforcer" items={score.missingSkills} mark="–" tone="text-ink-3" />
              </div>
            )}
            {score.redFlags.length > 0 && (
              <div className="rounded-md bg-bad-bg px-3 py-2 text-bad">
                <p className="font-semibold">Points bloquants</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {score.redFlags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : score?.status === "failed" ? (
          <p className="text-bad">Score indisponible : {score.error ?? "sortie invalide"}.</p>
        ) : cluster.scoreStatus === "pending" ? (
          <p className="text-ink-2">Score en attente (prochaine fenêtre du worker ou « Rescorer »).</p>
        ) : (
          <p className="text-ink-2">Pas de scoring : offre rejetée par le filtre.</p>
        )}
      </Section>

      {score?.status === "ok" && score.hook && (
        <div className="space-y-1.5 rounded-lg border border-line bg-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">Accroche</h2>
            <CopyButton text={score.hook} />
          </div>
          <p className="max-w-[68ch]">{score.hook}</p>
        </div>
      )}

      <Section title="Description">
        <div className="prose-job">{job.descriptionText || "Description non disponible."}</div>
      </Section>

      <div className="space-y-2">
        <Disclosure title="Lettre de motivation" open={Boolean(application?.draftBody)}>
          <CoverLetter
            clusterId={clusterId}
            applicationId={application?.id ?? null}
            subject={application?.draftSubject ?? ""}
            body={application?.draftBody ?? ""}
          />
        </Disclosure>

        <Disclosure title={`Sources (${members.length})`}>
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li key={m.job.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-ink-3">{sourceKindLabel[m.sourceKind]}</span> ·{" "}
                  <ExternalLink href={m.job.url}>{m.sourceLabel}</ExternalLink>
                  {m.job.id === canonical.job.id && (
                    <span className="ml-1 text-xs text-ink-3">(principale)</span>
                  )}
                </span>
                <span className="text-xs text-ink-3">{m.job.closedAt ? "close" : ago(m.job.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
          {canonical.sourceKind === "jobicy" && (
            <p className="mt-2 text-xs text-ink-3">
              Offre fournie par Jobicy (jobicy.com) — postuler via l'URL d'origine.
            </p>
          )}
        </Disclosure>

        <Disclosure title="Outils">
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
        </Disclosure>
      </div>
    </article>
  );
}

function SkillList({
  title,
  items,
  mark,
  tone,
}: {
  title: string;
  items: string[];
  mark: string;
  tone: string;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-ink-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-ink-3">—</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map((s) => (
            <li key={s}>
              <span className={`mr-1 font-bold ${tone}`} aria-hidden>
                {mark}
              </span>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
