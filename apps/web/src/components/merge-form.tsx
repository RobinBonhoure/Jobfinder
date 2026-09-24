"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeAction } from "@/actions/jobs";
import { buttonClass, inputClass } from "./ui";

export function MergeForm({
  clusterId,
  candidates,
}: {
  clusterId: string;
  candidates: Array<{ clusterId: string; title: string; company: string | null }>;
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (candidates.length === 0) return <p className="text-xs text-ink-3">Aucune offre proche à fusionner.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={`${inputClass} w-auto max-w-md`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Fusionner avec…</option>
        {candidates.map((c) => (
          <option key={c.clusterId} value={c.clusterId}>
            {c.title} — {c.company ?? "?"}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={buttonClass.secondary}
        disabled={!target || pending}
        onClick={() =>
          start(async () => {
            if (!window.confirm("Fusionner cette offre dans l'offre choisie ?")) return;
            const res = await mergeAction(clusterId, target);
            if (res.ok) router.push(`/jobs/${target}`);
            else setError(res.message);
          })
        }
      >
        Fusionner
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
