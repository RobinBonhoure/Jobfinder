import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { OutreachStatus } from "../../domain/enums";
import { getDb } from "../client";
import { applicationEvents, applications, companies, contacts, sources } from "../schema";

export async function listCompanies(filter: { outreach?: OutreachStatus | "targets" } = {}) {
  const where =
    filter.outreach === "targets"
      ? ne(companies.outreachStatus, "none")
      : filter.outreach
        ? eq(companies.outreachStatus, filter.outreach)
        : undefined;
  return getDb()
    .select({
      company: companies,
      contacts: sql<number>`(select count(*)::int from ${contacts} ct where ct.company_id = "companies"."id" and ct.deleted_at is null)`,
      openJobs: sql<number>`(select count(*)::int from jobs j where j.company_id = "companies"."id" and j.closed_at is null)`,
      hasBoard: sql<boolean>`exists (select 1 from ${sources} s where s.company_id = "companies"."id")`,
      lastSentAt: sql<Date | null>`(select max(a.applied_at) from ${applications} a where a.company_id = "companies"."id" and a.kind = 'spontaneous')`,
    })
    .from(companies)
    .where(where)
    .orderBy(sql`${companies.outreachStatus} = 'none'`, companies.name);
}
export type CompanyRow = Awaited<ReturnType<typeof listCompanies>>[number];

export async function getCompanyDetail(id: string) {
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return null;
  const contactRows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.companyId, id), isNull(contacts.deletedAt)))
    .orderBy(contacts.kind, contacts.email);
  const apps = await db
    .select()
    .from(applications)
    .where(and(eq(applications.companyId, id), eq(applications.kind, "spontaneous")))
    .orderBy(desc(applications.createdAt));
  const events = apps[0]
    ? await db
        .select()
        .from(applicationEvents)
        .where(eq(applicationEvents.applicationId, apps[0].id))
        .orderBy(desc(applicationEvents.occurredAt))
    : [];
  const boards = await db.select().from(sources).where(eq(sources.companyId, id));
  return { company, contacts: contactRows, applications: apps, events, boards };
}
export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompanyDetail>>>;
