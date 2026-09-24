"use client";

import { mailtoLink } from "@jobhunt/core/domain";
import { useState, useTransition } from "react";
import { markSentAction, saveDraftAction } from "@/actions/companies";
import { CopyButton } from "./copy-button";
import { buttonClass, inputClass } from "./ui";

export function DraftEditor({
  applicationId,
  to,
  subject: initialSubject,
  body: initialBody,
  sent,
}: {
  applicationId: string;
  to: string;
  subject: string;
  body: string;
  sent: boolean;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const dirty = subject !== initialSubject || body !== initialBody;
  const href = mailtoLink(to, subject, body);

  const save = () =>
    start(async () => {
      const res = await saveDraftAction(applicationId, subject, body);
      setMessage(res.ok ? "Brouillon enregistré" : res.message);
    });

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-3">
        Destinataire : <span className="font-mono">{to}</span>
      </p>
      <input
        className={inputClass}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={sent}
      />
      <textarea
        className={`${inputClass} min-h-64 font-[inherit] leading-relaxed`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={sent}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!sent && (
          <button type="button" className={buttonClass.secondary} disabled={!dirty || pending} onClick={save}>
            Enregistrer
          </button>
        )}
        {href ? (
          <a className={buttonClass.secondary} href={href}>
            Ouvrir dans le client mail
          </a>
        ) : (
          <span className="text-xs text-ink-3">Message trop long pour un lien mailto : copie-le.</span>
        )}
        <CopyButton text={subject} label="Copier l'objet" />
        <CopyButton text={body} label="Copier le message" />
        {!sent && (
          <button
            type="button"
            className={buttonClass.primary}
            disabled={pending || dirty}
            title={dirty ? "Enregistre d'abord le brouillon" : undefined}
            onClick={() =>
              start(async () => {
                if (!window.confirm("As-tu bien envoyé ce message depuis ton client mail ?")) return;
                const res = await markSentAction(applicationId);
                setMessage(res.ok ? "Marqué comme envoyé — relance prévue dans 7 jours" : res.message);
              })
            }
          >
            Marquer envoyé
          </button>
        )}
        {message && <span className="text-xs text-ink-3">{message}</span>}
      </div>
    </div>
  );
}
