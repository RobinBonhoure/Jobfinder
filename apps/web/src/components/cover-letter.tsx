"use client";

import { useState, useTransition } from "react";
import { generateCoverLetterAction, saveCoverLetterAction } from "@/actions/applications";
import { CopyButton } from "./copy-button";
import { buttonClass, inputClass } from "./ui";

/**
 * Lettre de motivation d'une offre : génération LLM, correction à la main, copie.
 * Elle est rangée dans le brouillon de la candidature (créée « à postuler » si besoin).
 */
export function CoverLetter({
  clusterId,
  applicationId: initialApplicationId,
  subject: initialSubject,
  body: initialBody,
}: {
  clusterId: string;
  applicationId: string | null;
  subject: string;
  body: string;
}) {
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [saved, setSaved] = useState({ subject: initialSubject, body: initialBody });
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [extra, setExtra] = useState("");
  const [gaps, setGaps] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = subject !== saved.subject || body !== saved.body;

  const generate = () =>
    start(async () => {
      if (body && !window.confirm("Remplacer la lettre actuelle ?")) return;
      setMessage(null);
      const res = await generateCoverLetterAction(clusterId, extra);
      if (!res.ok) {
        setMessage({ ok: false, text: res.message });
        return;
      }
      setApplicationId(res.data.applicationId);
      setSubject(res.data.subject);
      setBody(res.data.body);
      setSaved({ subject: res.data.subject, body: res.data.body });
      setGaps(res.data.gaps);
      setMessage({ ok: true, text: res.data.talkingPoints.join(" · ") || "Lettre générée" });
    });

  const save = () =>
    start(async () => {
      if (!applicationId) return;
      const res = await saveCoverLetterAction(applicationId, subject, body);
      if (res.ok) setSaved({ subject, body });
      setMessage({ ok: res.ok, text: res.ok ? "Lettre enregistrée" : res.message });
    });

  return (
    <div className="space-y-2">
      {body ? (
        <>
          <input
            className={inputClass}
            value={subject}
            aria-label="Objet"
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea
            className={`${inputClass} min-h-80 font-[inherit] leading-relaxed`}
            value={body}
            aria-label="Lettre de motivation"
            onChange={(e) => setBody(e.target.value)}
          />
        </>
      ) : (
        <p className="text-sm text-zinc-500">
          Aucune lettre. La génération lit l'annonce et le CV de <code>profile/cv.md</code>, puis range le
          texte dans le brouillon de la candidature.
        </p>
      )}

      <input
        className={inputClass}
        value={extra}
        placeholder="Consignes pour la génération (optionnel) : insister sur…, ton plus court…"
        onChange={(e) => setExtra(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass.primary}
          disabled={pending}
          onClick={generate}
          title="Appel au modèle outreach (quelques centimes)"
        >
          {pending ? "Rédaction…" : body ? "Régénérer la lettre" : "Générer la lettre de motivation"}
        </button>
        {body && (
          <>
            <button
              type="button"
              className={buttonClass.secondary}
              disabled={!dirty || pending}
              onClick={save}
            >
              Enregistrer
            </button>
            <CopyButton text={body} label="Copier la lettre" />
            <CopyButton text={subject} label="Copier l'objet" />
          </>
        )}
      </div>

      {gaps.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Volontairement absent de la lettre, à préparer pour l'entretien : {gaps.join(" · ")}
        </p>
      )}
      {message && (
        <p className={`text-xs ${message.ok ? "text-zinc-500" : "text-red-700 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
