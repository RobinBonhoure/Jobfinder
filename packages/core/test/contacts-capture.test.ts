import { describe, expect, it } from "vitest";
import { canonicalUrl } from "../src/capture/service";
import {
  contactPriority,
  deobfuscate,
  extractGenericEmails,
  findCandidatePages,
  robotsDisallows,
} from "../src/contacts/extract";
import { isWorkerStale, lastScheduledWindow } from "../src/maintenance";
import { mailtoLink, privacyNotice } from "../src/outreach/service";

describe("extractGenericEmails", () => {
  const html = `
    <footer>
      <a href="mailto:jobs@acme.fr?subject=Candidature">Postuler</a>
      <p>Contact : hello [at] acme [dot] fr — presse : jean.dupont@acme.fr</p>
      <p>Support : support@acme.fr, partenaire : contact@autre-domaine.com, recrutement@rh.acme.fr</p>
    </footer>`;
  it("ne garde que les adresses génériques du domaine, triées par priorité", () => {
    expect(extractGenericEmails(html, "acme.fr")).toEqual([
      "jobs@acme.fr",
      "recrutement@rh.acme.fr",
      "hello@acme.fr",
    ]);
  });
  it("écarte les adresses nominatives", () => {
    expect(extractGenericEmails(html, "acme.fr")).not.toContain("jean.dupont@acme.fr");
  });
  it("décode les obfuscations", () => {
    expect(deobfuscate("jobs (at) acme (dot) fr")).toBe("jobs@acme.fr");
  });
  it("priorise jobs@ sur contact@", () => {
    expect(contactPriority("jobs@a.fr")).toBeLessThan(contactPriority("contact@a.fr"));
  });
});

describe("findCandidatePages", () => {
  it("garde les liens internes pertinents", () => {
    const html = `<a href="/contact">Contact</a><a href="https://acme.fr/nous-rejoindre">Rejoignez-nous</a>
      <a href="https://twitter.com/acme">Twitter</a><a href="/blog">Blog</a><a href="/mentions-legales#x">Mentions</a>`;
    expect(findCandidatePages(html, "https://acme.fr/")).toEqual([
      "https://acme.fr/contact",
      "https://acme.fr/nous-rejoindre",
      "https://acme.fr/mentions-legales",
    ]);
  });
});

describe("robotsDisallows", () => {
  const robots = `User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: BadBot\nDisallow: /`;
  it("applique le groupe *", () => {
    expect(robotsDisallows(robots, "/private/data")).toBe(true);
    expect(robotsDisallows(robots, "/private/jobs")).toBe(false);
    expect(robotsDisallows(robots, "/contact")).toBe(false);
  });
  it("robots.txt vide : tout est permis", () => {
    expect(robotsDisallows("", "/contact")).toBe(false);
  });
  it("respecte un groupe spécifique", () => {
    expect(robotsDisallows("User-agent: JobHunt\nDisallow: /", "/contact")).toBe(true);
  });
});

describe("canonicalUrl", () => {
  it("normalise les URL LinkedIn", () => {
    expect(
      canonicalUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678&trk=x"),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678/");
    expect(
      canonicalUrl("https://fr.linkedin.com/jobs/view/dev-react-at-acme-4012345678?trackingId=abc"),
    ).toBe("https://www.linkedin.com/jobs/view/4012345678/");
  });
  it("retire les paramètres de suivi", () => {
    expect(
      canonicalUrl("https://www.welcometothejungle.com/fr/companies/acme/jobs/dev?utm_source=x&q=react#top"),
    ).toBe("https://www.welcometothejungle.com/fr/companies/acme/jobs/dev?q=react");
  });
});

describe("outreach", () => {
  it("construit un mailto encodé et refuse les messages trop longs", () => {
    expect(mailtoLink("jobs@acme.fr", "Bonjour", "Corps court")).toBe(
      "mailto:jobs%40acme.fr?subject=Bonjour&body=Corps%20court",
    );
    expect(mailtoLink("jobs@acme.fr", "Sujet", "x".repeat(2000))).toBeNull();
  });
  it("la mention d'information cite l'origine de l'adresse", () => {
    expect(privacyNotice("manual:rencontre au meetup ReactJS Toulouse")).toContain(
      "rencontre au meetup ReactJS Toulouse",
    );
  });
});

describe("fenêtres du worker", () => {
  it("trouve la dernière fenêtre prévue", () => {
    const w = lastScheduledWindow(new Date("2026-09-17T14:30:00+02:00"));
    expect(w.toISOString()).toBe(new Date("2026-09-17T12:00:00+02:00").toISOString());
    const night = lastScheduledWindow(new Date("2026-09-18T03:00:00+02:00"));
    expect(night.toISOString()).toBe(new Date("2026-09-17T22:00:00+02:00").toISOString());
  });
  it("détecte un worker en retard", () => {
    const now = new Date("2026-09-17T13:00:00+02:00");
    expect(isWorkerStale(new Date("2026-09-17T12:05:00+02:00"), now)).toBe(false);
    expect(isWorkerStale(new Date("2026-09-17T07:05:00+02:00"), now)).toBe(true);
    expect(isWorkerStale(null, now)).toBe(true);
  });
});
