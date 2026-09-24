"use client";

import type { CompanySearchHit } from "@jobhunt/core/companies";
import { type ActionResult, OUTREACH_STATUSES, outreachStatusLabel } from "@jobhunt/core/domain";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  addCompanyAction,
  addCompanyFormAction,
  addContactAction,
  searchCompaniesAction,
  updateCompanyAction,
} from "@/actions/companies";
import { buttonClass, inputClass } from "./ui";

const HEADCOUNTS: Array<[string, string]> = [
  ["", "Effectif"],
  ["11", "10-19"],
  ["12", "20-49"],
  ["21", "50-99"],
  ["22", "100-199"],
  ["31", "200-249"],
  ["32", "250-499"],
  ["41", "500-999"],
];

export function CompanySearch() {
  const [state, action, pending] = useActionState<ActionResult<CompanySearchHit[]> | null, FormData>(
    searchCompaniesAction,
    null,
  );
  const [added, setAdded] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  return (
    <div className="space-y-3">
      <form action={action} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input name="q" className={inputClass} placeholder="Nom (ex. « lemlist »)" />
        <input name="naf" className={inputClass} placeholder="NAF (ex. 62.01Z)" />
        <select name="headcount" className={inputClass} defaultValue="">
          {HEADCOUNTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input name="departement" className={inputClass} placeholder="Département (ex. 31)" />
        <button type="submit" className={buttonClass.secondary} disabled={pending}>
          {pending ? "…" : "Rechercher"}
        </button>
      </form>
      <p className="text-xs text-ink-3">
        Source : API Recherche d'entreprises (data.gouv). Elle ne fournit ni site ni email : renseigne le site
        après ajout.
      </p>
      {state && !state.ok && <p className="text-sm text-bad">{state.message}</p>}
      {state?.ok && state.data.length === 0 && <p className="text-sm text-ink-3">Aucun résultat.</p>}
      {state?.ok && state.data.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {state.data.map((hit) => (
            <li key={hit.siren} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{hit.name}</span>{" "}
                <span className="text-xs text-ink-3">
                  {hit.city ?? "?"} · NAF {hit.nafCode ?? "?"} · effectif {hit.headcountRange ?? "?"} · SIREN{" "}
                  {hit.siren}
                </span>
              </span>
              {added[hit.siren] ? (
                <span className="text-xs text-good">{added[hit.siren]}</span>
              ) : (
                <button
                  type="button"
                  className={buttonClass.ghost}
                  onClick={() =>
                    start(async () => {
                      const res = await addCompanyAction({
                        name: hit.name,
                        siren: hit.siren,
                        nafCode: hit.nafCode ?? undefined,
                        naf25Code: hit.naf25Code ?? undefined,
                        headcountRange: hit.headcountRange ?? undefined,
                        city: hit.city ?? undefined,
                      });
                      setAdded((a) => ({ ...a, [hit.siren]: res.ok ? "Ajoutée ✓" : res.message }));
                    })
                  }
                >
                  + Cible
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AddCompanyForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    async (prev, fd) => {
      const res = await addCompanyFormAction(prev, fd);
      if (res.ok) router.push(`/companies/${res.data.id}`);
      return res;
    },
    null,
  );
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[2fr_2fr_auto]">
      <input name="name" required className={inputClass} placeholder="Nom de l'entreprise" />
      <input name="website" className={inputClass} placeholder="Site web (ex. lemlist.com)" />
      <button type="submit" className={buttonClass.primary} disabled={pending}>
        Ajouter
      </button>
      {state && !state.ok && <p className="text-xs text-bad sm:col-span-3">{state.message}</p>}
    </form>
  );
}

export function CompanyEditor({
  companyId,
  website,
  notes,
  outreachStatus,
}: {
  companyId: string;
  website: string | null;
  notes: string;
  outreachStatus: string;
}) {
  const [pending, start] = useTransition();
  const [site, setSite] = useState(website ?? "");
  const [text, setText] = useState(notes);
  const [status, setStatus] = useState(outreachStatus);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateCompanyAction(companyId, {
            website: site || null,
            notes: text,
            outreachStatus: status as (typeof OUTREACH_STATUSES)[number],
          });
          setMessage(res.ok ? "Enregistré" : res.message);
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <input
          className={inputClass}
          value={site}
          onChange={(e) => setSite(e.target.value)}
          placeholder="Site web"
        />
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          {OUTREACH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "none" ? "Pas une cible" : outreachStatusLabel[s]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className={`${inputClass} min-h-20`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notes : produit, stack, pourquoi cette entreprise… (utilisées pour personnaliser le message)"
      />
      <div className="flex items-center gap-2">
        <button type="submit" className={buttonClass.secondary} disabled={pending}>
          Enregistrer
        </button>
        {message && <span className="text-xs text-ink-3">{message}</span>}
      </div>
    </form>
  );
}

export function ContactForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    addContactAction,
    null,
  );
  const [kind, setKind] = useState("generic");
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr]">
        <input name="email" type="email" required className={inputClass} placeholder="email" />
        <select name="kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="generic">Générique (jobs@, contact@…)</option>
          <option value="personal">Personne physique</option>
        </select>
        <input
          name="label"
          className={inputClass}
          placeholder={kind === "personal" ? "Nom, rôle" : "Libellé"}
        />
      </div>
      <input
        name="sourceNote"
        required
        minLength={3}
        className={inputClass}
        placeholder="Origine de l'adresse (obligatoire) : page contact, rencontre au meetup X, email reçu le…"
      />
      {kind === "personal" && (
        <p className="text-xs text-warn">
          Donnée personnelle : une mention d'information sera ajoutée automatiquement au message, et le
          contact peut être supprimé à tout moment.
        </p>
      )}
      <button type="submit" className={buttonClass.secondary} disabled={pending}>
        Ajouter le contact
      </button>
      {state && !state.ok && <p className="text-xs text-bad">{state.message}</p>}
    </form>
  );
}
