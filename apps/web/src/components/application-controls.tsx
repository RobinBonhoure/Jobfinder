"use client";

import { type ActionResult, APPLICATION_STATUSES, applicationStatusLabel } from "@jobhunt/core/domain";
import { useActionState, useState, useTransition } from "react";
import {
  addNoteAction,
  createExternalApplicationAction,
  setNextActionAction,
  updateStatusAction,
} from "@/actions/applications";
import { buttonClass, inputClass } from "./ui";

export function StatusSelect({ applicationId, status }: { applicationId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <select
        className={`${inputClass} w-auto py-1`}
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          start(async () => {
            const res = await updateStatusAction(applicationId, value);
            setError(res.ok ? null : res.message);
          });
        }}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {applicationStatusLabel[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

export function NextActionInput({ applicationId, value }: { applicationId: string; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      className={`${inputClass} w-auto py-1`}
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          await setNextActionAction(applicationId, v);
        });
      }}
    />
  );
}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addNoteAction(applicationId, note);
          if (res.ok) setNote("");
          else setError(res.message);
        });
      }}
    >
      <input
        className={inputClass}
        placeholder="Ajouter une note (échange, entretien, relance…)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className={buttonClass.secondary} disabled={pending || !note.trim()}>
        Ajouter
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </form>
  );
}

export function ExternalApplicationForm() {
  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createExternalApplicationAction,
    null,
  );
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto_auto]">
      <input name="title" placeholder="Intitulé du poste" className={inputClass} required />
      <input name="company" placeholder="Entreprise" className={inputClass} required />
      <input name="url" type="url" placeholder="URL de l'offre" className={inputClass} required />
      <select name="status" className={`${inputClass} w-auto`} defaultValue="applied">
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {applicationStatusLabel[s]}
          </option>
        ))}
      </select>
      <button type="submit" className={buttonClass.primary} disabled={pending}>
        {pending ? "…" : "Ajouter"}
      </button>
      {state && !state.ok && <p className="text-xs text-bad sm:col-span-5">{state.message}</p>}
      {state?.ok && <p className="text-xs text-good sm:col-span-5">Candidature ajoutée.</p>}
    </form>
  );
}
