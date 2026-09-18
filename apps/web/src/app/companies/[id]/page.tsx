import { getCompanyDetail } from "@jobhunt/core/db";
import { applicationStatusLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteContactAction,
  discoverContactsAction,
  generateDraftAction,
  optOutContactAction,
} from "@/actions/companies";
import { ActionButton } from "@/components/action-button";
import { NextActionInput, StatusSelect } from "@/components/application-controls";
import { CompanyEditor, ContactForm } from "@/components/company-controls";
import { DraftEditor } from "@/components/draft-editor";
import { Badge, Banner, Card, ExternalLink, PageHeader } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default async function CompanyPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();
  const { company, contacts, applications, events, boards } = detail;
  const current = applications[0];
  const currentContact = contacts.find((c) => c.id === current?.contactId);
  const usable = contacts.filter((c) => c.email && !c.optedOutAt);

  return (
    <>
      <Link href="/companies" className="text-xs text-zinc-500 hover:underline">
        ← Spontanées
      </Link>
      <PageHeader
        title={company.name}
        subtitle={
          <>
            {company.website ? (
              <ExternalLink href={company.website}>{company.domain}</ExternalLink>
            ) : (
              "site inconnu"
            )}
            {company.siren && ` · SIREN ${company.siren}`}
            {company.nafCode && ` · NAF ${company.nafCode}`}
            {company.headcountRange && ` · effectif ${company.headcountRange}`}
            {boards.length > 0 && ` · ${boards.length} board(s) ATS suivi(s)`}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <Card title="Message">
            {current?.draftBody && currentContact?.email ? (
              <DraftEditor
                key={`${current.id}-${current.updatedAt.getTime()}`}
                applicationId={current.id}
                to={currentContact.email}
                subject={current.draftSubject ?? ""}
                body={current.draftBody}
                sent={current.status !== "to_apply"}
              />
            ) : usable.length === 0 ? (
              <p className="text-sm text-zinc-500">Ajoute ou découvre un contact pour générer un message.</p>
            ) : (
              <p className="text-sm text-zinc-500">
                Choisis un contact ci-contre et clique sur « Générer le message ».
              </p>
            )}
          </Card>

          {current && (
            <Card title="Suivi">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusSelect applicationId={current.id} status={current.status} />
                <span className="text-xs text-zinc-500">Relance</span>
                <NextActionInput applicationId={current.id} value={current.nextActionAt} />
                {current.appliedAt && (
                  <span className="text-xs text-zinc-500">envoyé le {fmtDate(current.appliedAt)}</span>
                )}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                {events.map((e) => (
                  <li key={e.id}>
                    {fmtDateTime(e.occurredAt)} — {e.type}
                    {e.toStatus && ` → ${applicationStatusLabel[e.toStatus]}`}
                    {e.note && ` : ${e.note}`}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Informations">
            <CompanyEditor
              companyId={company.id}
              website={company.website}
              notes={company.notes}
              outreachStatus={company.outreachStatus}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Contacts"
            actions={
              <ActionButton
                action={discoverContactsAction.bind(null, company.id)}
                variant="ghost"
                pendingLabel="Exploration du site…"
              >
                Découvrir sur le site
              </ActionButton>
            }
          >
            {!company.domain && (
              <Banner tone="amber">Renseigne le site web pour pouvoir explorer les pages contact.</Banner>
            )}
            <ul className="space-y-2 text-sm">
              {contacts.length === 0 && <li className="text-zinc-500">Aucun contact.</li>}
              {contacts.map((c) => (
                <li key={c.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{c.email}</span>
                    <span className="flex gap-1">
                      <Badge tone={c.kind === "personal" ? "amber" : "neutral"}>
                        {c.kind === "personal" ? "nominatif" : "générique"}
                      </Badge>
                      {c.mxValid === false && <Badge tone="red">MX douteux</Badge>}
                      {c.optedOutAt && <Badge tone="red">opposition</Badge>}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {c.label && `${c.label} · `}source : {c.source} · {fmtDate(c.collectedAt)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!c.optedOutAt && (
                      <ActionButton
                        action={generateDraftAction.bind(null, company.id, c.id)}
                        variant="primary"
                        pendingLabel="Rédaction…"
                      >
                        Générer le message
                      </ActionButton>
                    )}
                    {!c.optedOutAt && (
                      <ActionButton
                        action={optOutContactAction.bind(null, c.id)}
                        variant="ghost"
                        confirm="Marquer ce contact comme « ne plus contacter » ?"
                      >
                        Opposition
                      </ActionButton>
                    )}
                    <ActionButton
                      action={deleteContactAction.bind(null, c.id)}
                      variant="ghost"
                      confirm="Supprimer ce contact ? (effacement définitif sous 30 jours)"
                    >
                      Supprimer
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Ajouter un contact">
            <ContactForm companyId={company.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
