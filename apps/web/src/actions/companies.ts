"use server";

import {
  type CompanySearchHit,
  findOrCreateCompany,
  SearchCompaniesInput,
  searchCompanies,
  updateCompany,
} from "@jobhunt/core/companies";
import {
  addManualContact,
  type DiscoveryResult,
  deleteContact,
  discoverContacts,
  ManualContactInput,
  optOutContact,
} from "@jobhunt/core/contacts";
import { type ActionResult, OUTREACH_STATUSES } from "@jobhunt/core/domain";
import { generateOutreachDraft, markOutreachSent, saveOutreachDraft } from "@jobhunt/core/outreach";
import { z } from "zod";
import { idSchema, parseForm, runAction } from "@/lib/action";

export async function searchCompaniesAction(
  _prev: ActionResult<CompanySearchHit[]> | null,
  formData: FormData,
): Promise<ActionResult<CompanySearchHit[]>> {
  return runAction(
    async () => {
      const raw = parseForm(
        z.object({
          q: z.string().optional(),
          naf: z.string().optional(),
          headcount: z.string().optional(),
          departement: z.string().optional(),
        }),
        formData,
      );
      const clean = Object.fromEntries(Object.entries(raw).filter(([, v]) => v?.trim()));
      return searchCompanies(SearchCompaniesInput.parse({ ...clean, page: 1 }));
    },
    { refresh: false },
  );
}

const CompanyForm = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  website: z.string().trim().max(300).optional(),
  siren: z
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  nafCode: z.string().max(10).optional(),
  naf25Code: z.string().max(10).optional(),
  headcountRange: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
});

export async function addCompanyAction(input: z.input<typeof CompanyForm>) {
  return runAction(async () => {
    const data = CompanyForm.parse(input);
    const company = await findOrCreateCompany({
      ...data,
      source: data.siren ? "recherche_entreprises" : "manual",
    });
    await updateCompany(company.id, {
      outreachStatus: company.outreachStatus === "none" ? "to_contact" : company.outreachStatus,
    });
    return { id: company.id };
  });
}

export async function addCompanyFormAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => typeof v === "string" && v.trim()),
  );
  return addCompanyAction(raw as z.input<typeof CompanyForm>);
}

const CompanyPatch = z.object({
  website: z.string().trim().max(300).nullable().optional(),
  notes: z.string().max(5000).optional(),
  outreachStatus: z.enum(OUTREACH_STATUSES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function updateCompanyAction(companyId: string, patch: z.input<typeof CompanyPatch>) {
  return runAction(async () => {
    const p = CompanyPatch.parse(patch);
    await updateCompany(idSchema.parse(companyId), { ...p, website: p.website === "" ? null : p.website });
  });
}

export async function discoverContactsAction(
  companyId: string,
): Promise<ActionResult<DiscoveryResult & { message: string }>> {
  return runAction(async () => {
    const r = await discoverContacts(idSchema.parse(companyId));
    const message =
      `${r.pagesVisited.length} page(s) lue(s), ${r.found.length} adresse(s) générique(s), ${r.added.length} ajoutée(s)` +
      (r.blockedByRobots.length ? ` · ${r.blockedByRobots.length} bloquée(s) par robots.txt` : "");
    return { ...r, message };
  });
}

export async function addContactAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const contact = await addManualContact(parseForm(ManualContactInput, formData));
    return { id: contact.id };
  });
}

export async function deleteContactAction(contactId: string) {
  return runAction(() => deleteContact(idSchema.parse(contactId)));
}

export async function optOutContactAction(contactId: string) {
  return runAction(() => optOutContact(idSchema.parse(contactId)));
}

export async function generateDraftAction(companyId: string, contactId: string) {
  return runAction(async () => {
    const res = await generateOutreachDraft(idSchema.parse(companyId), idSchema.parse(contactId));
    return { applicationId: res.application?.id ?? null, personalization: res.personalization };
  });
}

export async function saveDraftAction(applicationId: string, subject: string, body: string) {
  return runAction(() =>
    saveOutreachDraft(
      idSchema.parse(applicationId),
      z.string().trim().min(1, "Objet requis").max(200).parse(subject),
      z.string().trim().min(20, "Message trop court").max(10_000).parse(body),
    ),
  );
}

export async function markSentAction(applicationId: string) {
  return runAction(() => markOutreachSent(idSchema.parse(applicationId)));
}
