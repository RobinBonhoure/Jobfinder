"use client";

import type { ActionResult } from "@jobhunt/core/domain";
import { type ReactNode, useState, useTransition } from "react";
import { buttonClass } from "./ui";

interface Props<T> {
  /** Server action déjà liée à ses arguments (`action.bind(null, id)`). */
  action: () => Promise<ActionResult<T>>;
  children: ReactNode;
  variant?: keyof typeof buttonClass;
  confirm?: string;
  pendingLabel?: string;
  /** Message affiché après succès. Si l'action renvoie `{ message }`, celui-ci est affiché à la place. */
  success?: string;
  title?: string;
}

function messageOf(data: unknown): string | null {
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string")
    return data.message;
  return null;
}

export function ActionButton<T>({
  action,
  children,
  variant = "secondary",
  confirm,
  pendingLabel,
  success,
  title,
}: Props<T>) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    setMessage(null);
    start(async () => {
      const res = await action();
      if (!res.ok) setMessage({ ok: false, text: res.message });
      else {
        const fromAction = messageOf(res.data);
        if (fromAction ?? success) setMessage({ ok: true, text: fromAction ?? (success as string) });
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={buttonClass[variant]}
        title={title}
      >
        {pending ? (pendingLabel ?? "…") : children}
      </button>
      {message && (
        <span
          className={`text-xs ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
