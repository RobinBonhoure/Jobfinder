"use client";

import type { TriageStatus } from "@jobhunt/core/domain";
import { useState, useTransition } from "react";
import { setTriageAction } from "@/actions/jobs";
import { useSelectJob } from "@/lib/use-select-job";
import { buttonClass } from "./ui";

const BUTTONS: Array<{ value: Exclude<TriageStatus, "new">; label: string; key: string }> = [
  { value: "interested", label: "★ Intéressé", key: "i" },
  { value: "dismissed", label: "Écarter", key: "x" },
  { value: "applied", label: "J'ai postulé", key: "a" },
];

/**
 * Boutons de tri d'une fiche. Dans une vue liste + fiche, `nextId` est l'offre à afficher
 * ensuite (la ligne triée quitte la liste) ; en pleine page, il est absent et on reste sur place.
 */
export function TriageButtons({
  clusterId,
  triage,
  nextId,
}: {
  clusterId: string;
  triage: TriageStatus;
  nextId?: string | null;
}) {
  const select = useSelectJob();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inList = nextId !== undefined;

  const run = (value: Exclude<TriageStatus, "new">) =>
    start(async () => {
      setError(null);
      if (inList) select(nextId);
      const res = await setTriageAction(clusterId, value);
      if (!res.ok) setError(res.message);
    });

  return (
    <>
      {BUTTONS.filter((b) => b.value !== "applied" || triage !== "applied").map((b) => (
        <button
          key={b.value}
          type="button"
          disabled={pending}
          aria-pressed={triage === b.value}
          onClick={() => run(b.value)}
          className={`${buttonClass.secondary} aria-pressed:border-accent aria-pressed:bg-sel`}
        >
          {b.label}
          {inList && <kbd>{b.key}</kbd>}
        </button>
      ))}
      {error && <span className="text-xs text-bad">{error}</span>}
    </>
  );
}
