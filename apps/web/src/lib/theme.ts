/** Préférence de thème, stockée dans un cookie pour que le serveur rende le bon thème (pas de flash). */
export const THEME_COOKIE = "jobhunt-theme";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const parseTheme = (value: string | undefined): Theme =>
  value === "light" || value === "dark" ? value : "system";
