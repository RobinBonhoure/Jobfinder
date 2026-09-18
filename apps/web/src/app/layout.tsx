import { getHeartbeat, navCounts, pingDb } from "@jobhunt/core/db";
import { isWorkerStale } from "@jobhunt/core/maintenance";
import type { Metadata } from "next";
import Link from "next/link";
import { Banner, NavLink } from "@/components/ui";
import { ago } from "@/lib/format";
import "./globals.css";

// Données personnelles et toujours fraîches : aucun prérendu (PLAN §8.1).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobHunt",
  description: "Recherche d'emploi — CDI full remote",
};

async function Sidebar() {
  const [counts, hb] = await Promise.all([navCounts(), getHeartbeat()]);
  const stale = isWorkerStale(hb?.lastTickAt ?? null);
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="mb-3 px-3 text-lg font-bold tracking-tight">
        JobHunt
      </Link>
      <NavLink href="/" label="Inbox" count={counts.inbox} />
      <NavLink href="/interesting" label="À postuler" count={counts.interesting} />
      <NavLink href="/pipeline" label="Candidatures" count={counts.followUps} alert />
      <NavLink href="/rejected" label="Rejetées" />
      <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
      <NavLink href="/companies" label="Spontanées" />
      <NavLink href="/sources" label="Sources" count={counts.brokenSources + counts.disabledBySystem} alert />
      <div className="mt-auto space-y-1 px-3 text-xs text-zinc-500">
        <p title={hb?.lastTickAt?.toISOString()}>
          <span
            className={`mr-1 inline-block h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          Worker : {hb?.lastTickAt ? ago(hb.lastTickAt) : "jamais lancé"}
        </p>
        {counts.pendingScores > 0 && <p>{counts.pendingScores} score(s) en attente</p>}
      </div>
    </aside>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const dbUp = await pingDb();
  return (
    <html lang="fr">
      <body className="min-h-screen">
        {dbUp ? (
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="min-w-0 flex-1 px-6 py-5">
              <WorkerBanners />
              {children}
            </main>
          </div>
        ) : (
          <main className="mx-auto max-w-xl p-10">
            <Banner tone="red">
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
      <Banner key="stale" tone="amber">
        Le worker n'est pas passé depuis la dernière fenêtre prévue ({ago(hb.lastTickAt)}). Lance{" "}
        <code>pnpm dev</code> ou <code>pnpm start:all</code>.
      </Banner>,
    );
  }
  if (hb && !hb.scoringEnabled) {
    banners.push(
      <Banner key="nokey" tone="blue">
        Scoring LLM désactivé (pas de <code>ANTHROPIC_API_KEY</code>) : les offres sont triées par pré-score.
      </Banner>,
    );
  }
  if (hb?.lastScoringError) {
    banners.push(
      <Banner key="scoring" tone="red">
        Scoring en panne : {hb.lastScoringError}
      </Banner>,
    );
  }
  return <>{banners}</>;
}
