"use client";

import type { ActionResult } from "@jobhunt/core/domain";
import type { AddSourceResult } from "@jobhunt/core/sources";
import { useActionState, useTransition } from "react";
import { addSourceAction, setIntervalAction, toggleSourceAction } from "@/actions/sources";
import { buttonClass, inputClass } from "./ui";

export function AddSourceForm() {
  const [state, action, pending] = useActionState<ActionResult<AddSourceResult> | null, FormData>(
    addSourceAction,
    null,
  );
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[3fr_1.5fr_auto]">
        <input
          name="url"
          type="url"
          required
          className={inputClass}
          placeholder="URL de la page carrières ou d'une offre (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Teamtailor)"
        />
        <input name="company" className={inputClass} placeholder="Nom de l'entreprise (optionnel)" />
        <button type="submit" className={buttonClass.primary} disabled={pending}>
          {pending ? "Test en cours…" : "Tester et ajouter"}
        </button>
      </div>
      {state && !state.ok && <p className="text-sm text-red-700 dark:text-red-400">{state.message}</p>}
      {state?.ok && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {state.data.sourceId} ajoutée : {state.data.fetched} offres, dont {state.data.passed} passent le
          filtre (ex. « {state.data.sampleTitles.join(" », « ")} »).
        </p>
      )}
    </form>
  );
}

export function SourceToggle({ sourceId, enabled }: { sourceId: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        defaultChecked={enabled}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          start(async () => {
            await toggleSourceAction(sourceId, v);
          });
        }}
      />
      {enabled ? "active" : "inactive"}
    </label>
  );
}

const INTERVALS = [
  [360, "6 h"],
  [720, "12 h"],
  [1440, "1 j"],
  [4320, "3 j"],
] as const;

export function IntervalSelect({ sourceId, value, min }: { sourceId: string; value: number; min: number }) {
  const [pending, start] = useTransition();
  return (
    <select
      className={`${inputClass} w-auto py-0.5 text-xs`}
      defaultValue={value}
      disabled={pending}
      onChange={(e) => {
        const v = Number(e.target.value);
        start(async () => {
          await setIntervalAction(sourceId, v);
        });
      }}
    >
      {INTERVALS.filter(([m]) => m >= min || m === value).map(([m, label]) => (
        <option key={m} value={m}>
          {label}
        </option>
      ))}
      {!INTERVALS.some(([m]) => m === value) && <option value={value}>{value} min</option>}
    </select>
  );
}
