import { getHeartbeat, navCounts, pingDb } from "@jobhunt/core/db";
import { isWorkerStale } from "@jobhunt/core/maintenance";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Banner } from "@/components/ui";
import { ago } from "@/lib/format";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import "./globals.css";

// Données personnelles et toujours fraîches : aucun prérendu (PLAN §8.1).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobHunt",
  description: "Recherche d'emploi — CDI full remote",
};

// Auto-hébergées par next/font au build : aucune requête vers Google depuis le navigateur.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

async function Sidebar({ theme }: { theme: Theme }) {
  const [counts, hb] = await Promise.all([navCounts(), getHeartbeat()]);
  const stale = isWorkerStale(hb?.lastTickAt ?? null);
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-3">
      <Link href="/" className="mb-3 px-3 pt-1 text-lg font-bold tracking-tight">
        JobHunt
      </Link>
      <NavLink href="/" label="Inbox" count={counts.inbox} />
      <NavLink href="/interesting" label="À postuler" count={counts.interesting} />
      <NavLink href="/pipeline" label="Candidatures" count={counts.followUps} alert />
      <NavLink href="/rejected" label="Rejetées" />
      <div className="mx-2 my-2 border-t border-line" />
      <NavLink href="/companies" label="Spontanées" />
      <NavLink href="/sources" label="Sources" count={counts.brokenSources + counts.disabledBySystem} alert />
      <div className="mt-auto space-y-3 px-1">
        <div className="space-y-1 px-2 text-xs text-ink-3">
          <p title={hb?.lastTickAt?.toISOString()} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${stale ? "bg-warn" : "bg-good"}`} />
            Worker · {hb?.lastTickAt ? ago(hb.lastTickAt) : "jamais lancé"}
          </p>
          {counts.pendingScores > 0 && <p>{counts.pendingScores} score(s) en attente</p>}
        </div>
        <ThemeToggle initial={theme} />
      </div>
    </aside>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [dbUp, store] = await Promise.all([pingDb(), cookies()]);
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  return (
    <html
      lang="fr"
      data-theme={theme === "system" ? undefined : theme}
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="h-screen overflow-hidden">
        {dbUp ? (
          <div className="flex h-full">
            <Sidebar theme={theme} />
            <main className="flex min-w-0 flex-1 flex-col">
              <WorkerBanners />
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </main>
          </div>
        ) : (
          <main className="mx-auto max-w-xl p-10">
            <Banner tone="bad">
              Base de données injoignable. Vérifie que le service PostgreSQL tourne et que{" "}
              <code>DATABASE_URL</code> est correct dans <code>.env</code>, puis lance{" "}
              <code>pnpm db:migrate</code>.
            </Banner>
          </main>
        )}
      </body>
    </html>
  );
}

async function WorkerBanners() {
  const hb = await getHeartbeat();
  const banners = [];
  if (hb && isWorkerStale(hb.lastTickAt)) {
    banners.push(
      <Banner key="stale" tone="warn">
        Le worker n'est pas passé depuis la dernière fenêtre prévue ({ago(hb.lastTickAt)}). Lance{" "}
        <code>pnpm dev</code> ou <code>pnpm start:all</code>.
      </Banner>,
    );
  }
  if (hb && !hb.scoringEnabled) {
    banners.push(
      <Banner key="nokey" tone="info">
        Scoring LLM désactivé (pas de <code>ANTHROPIC_API_KEY</code>) : les offres sont triées par pré-score.
      </Banner>,
    );
  }
  if (hb?.lastScoringError) {
    banners.push(
      <Banner key="scoring" tone="bad">
        Scoring en panne : {hb.lastScoringError}
      </Banner>,
    );
  }
  if (banners.length === 0) return null;
  return <div className="space-y-2 border-b border-line px-6 py-3">{banners}</div>;
}
