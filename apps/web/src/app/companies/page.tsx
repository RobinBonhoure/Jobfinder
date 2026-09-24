import { listCompanies } from "@jobhunt/core/db";
import { OUTREACH_STATUSES, type OutreachStatus, outreachStatusLabel } from "@jobhunt/core/domain";
import Link from "next/link";
import { AddCompanyForm, CompanySearch } from "@/components/company-controls";
import { Badge, Card, EmptyState, Page, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const sp = await searchParams;
  const all = sp.all === "1";
  const status = OUTREACH_STATUSES.includes(sp.status as OutreachStatus)
    ? (sp.status as OutreachStatus)
    : undefined;
  const rows = await listCompanies({ outreach: status ?? (all ? undefined : "targets") });

  return (
    <Page>
      <PageHeader
        title="Candidatures spontanées"
        subtitle="Entreprises cibles, contacts génériques et brouillons à envoyer depuis ton client mail."
        actions={
          <div className="flex gap-2 text-xs">
            <Link href="/companies" className={!all && !status ? "font-semibold" : "underline"}>
              Cibles
            </Link>
            {OUTREACH_STATUSES.filter((s) => s !== "none").map((s) => (
              <Link
                key={s}
                href={`/companies?status=${s}`}
                className={status === s ? "font-semibold" : "underline"}
              >
                {outreachStatusLabel[s]}
              </Link>
            ))}
            <Link href="/companies?all=1" className={all ? "font-semibold" : "underline"}>
              Toutes
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Ajouter une entreprise">
          <AddCompanyForm />
          <p className="mt-2 text-xs text-ink-3">
            Astuce : depuis la fiche d'une offre, « + Cible de candidature spontanée » ajoute son entreprise.
          </p>
        </Card>
        <Card title="Rechercher (SIRENE)">
          <CompanySearch />
        </Card>
      </div>
      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
        {rows.length === 0 ? (
          <EmptyState title="Aucune entreprise dans cette vue." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs text-ink-2">
              <tr className="border-b border-line">
                <th className="px-3 py-2 font-semibold">Entreprise</th>
                <th className="px-2 py-2 font-semibold">Statut</th>
                <th className="px-2 py-2 font-semibold">Contacts</th>
                <th className="px-2 py-2 font-semibold">Offres ouvertes</th>
                <th className="px-2 py-2 font-semibold">Dernier envoi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ company: c, contacts, openJobs, hasBoard, lastSentAt }) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/companies/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {c.domain ?? "site inconnu"} {c.city && `· ${c.city}`}{" "}
                      {hasBoard && <Badge>board ATS</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Badge
                      tone={
                        c.outreachStatus === "replied"
                          ? "good"
                          : c.outreachStatus === "contacted"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {outreachStatusLabel[c.outreachStatus]}
                    </Badge>
                  </td>
                  <td className="px-2 py-2">{contacts}</td>
                  <td className="px-2 py-2">{openJobs}</td>
                  <td className="px-2 py-2 text-xs">{fmtDate(lastSentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>
  );
}
