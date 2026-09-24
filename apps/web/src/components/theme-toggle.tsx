"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: Array<[Theme, string]> = [
  ["system", "Auto"],
  ["light", "Clair"],
  ["dark", "Sombre"],
];

/** Bascule Auto / Clair / Sombre : applique immédiatement et mémorise dans un cookie lu par le layout. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  const choose = (next: Theme) => {
    setTheme(next);
    // biome-ignore lint/suspicious/noDocumentCookie: cookie de préférence lu côté serveur par le layout.
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
  };

  return (
    <fieldset className="grid grid-cols-3 gap-0.5 rounded-md border border-line bg-canvas p-0.5">
      <legend className="sr-only">Thème</legend>
      {OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => choose(value)}
          className={`cursor-pointer rounded px-1.5 py-1 text-xs ${
            theme === value ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-3 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
