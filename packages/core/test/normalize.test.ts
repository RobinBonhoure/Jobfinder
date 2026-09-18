import { describe, expect, it } from "vitest";
import {
  buildJob,
  contractFromLabel,
  countryCodeFrom,
  detectContract,
  detectRemotePolicy,
  detectRemoteScope,
  detectSeniority,
  htmlToText,
  normalizeCompanyName,
  normalizeTitle,
  parseSalary,
} from "../src/normalize";

describe("htmlToText", () => {
  it("décode le HTML échappé de Greenhouse et garde les retours à la ligne", () => {
    const text = htmlToText(
      "&lt;p&gt;Hello &amp;amp; bienvenue&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;/ul&gt;",
    );
    expect(text).toContain("Hello & bienvenue");
    expect(text).toContain("React");
    expect(text).not.toContain("<");
  });
  it("supprime scripts et styles", () => {
    expect(htmlToText("<p>a</p><script>alert(1)</script><style>p{}</style>")).toBe("a");
  });
});

describe("normalizeTitle", () => {
  it.each([
    ["Développeur Front-End React (H/F)", "developpeur frontend react"],
    ["Développeuse Fullstack - CDI", "developpeur fullstack"],
    ["Senior Frontend Engineer (m/w/d)", "senior frontend engineer"],
    ["Full Stack Developer – Next.js / Full Remote", "fullstack developer next.js"],
    ["Account Executive - France 🇫🇷", "account executive france"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });
});

describe("normalizeCompanyName", () => {
  it("retire formes juridiques et accents", () => {
    expect(normalizeCompanyName("Société Générale SA")).toBe("societe generale");
    expect(normalizeCompanyName("Back Market SAS")).toBe("back market");
    expect(normalizeCompanyName("Datadog, Inc.")).toBe("datadog");
  });
});

describe("detectRemotePolicy", () => {
  it.each([
    ["Poste en full remote depuis la France", "full_remote"],
    ["100% télétravail possible", "full_remote"],
    ["Télétravail total, séminaires trimestriels", "full_remote"],
    ["Rythme hybride : 2 jours de télétravail par semaine", "hybrid"],
    ["3 jours par semaine au bureau à Paris", "hybrid"],
    ["Pas de télétravail, poste sur site", "onsite"],
    ["Rejoignez notre équipe produit", "unknown"],
    ["Full remote possible ou hybride selon vos envies", "unknown"],
  ] as const)("%s → %s", (text, expected) => {
    expect(detectRemotePolicy(text)).toBe(expected);
  });
});

describe("detectRemoteScope", () => {
  it("priorise la localisation", () => {
    expect(detectRemoteScope("Paris, France", "")).toBe("france");
    expect(detectRemoteScope("Remote - European Union", "")).toBe("europe");
    expect(detectRemoteScope("New York, USA", "")).toBe("other");
  });
  it("une localisation étrangère prime sur le texte", () => {
    expect(detectRemoteScope("Remote - United States", "We are a European company")).toBe("other");
    expect(detectRemoteScope("London", "Remote across Europe")).toBe("other");
    expect(detectRemoteScope("Marseille", "")).toBe("france");
    expect(detectRemoteScope("31 - TOULOUSE", "")).toBe("france");
    expect(detectRemoteScope("Somewhere", "")).toBe("unknown");
    expect(detectRemoteScope("Remote", "Poste ouvert partout en France")).toBe("france");
  });
  it("détecte les restrictions US dans le texte", () => {
    expect(detectRemoteScope("Remote", "Candidates must be located in the US.")).toBe("other");
  });
  it("renvoie unknown sans information", () => {
    expect(detectRemoteScope(null, "Une belle aventure")).toBe("unknown");
  });
});

describe("contrat et séniorité", () => {
  it.each([
    ["Stage développeur React", "", "internship"],
    ["Développeur React en alternance", "", "apprenticeship"],
    ["Développeur React", "Mission freelance de 6 mois, TJM selon profil", "freelance"],
    ["Développeur React", "Poste en CDI basé à Toulouse", "cdi"],
    ["Développeur React", "Belle équipe", "unknown"],
  ] as const)("%s / %s → %s", (title, text, expected) => {
    expect(detectContract(title, text)).toBe(expected);
  });
  it("mappe les libellés structurés", () => {
    expect(contractFromLabel("fulltime_permanent")).toBe("cdi");
    expect(contractFromLabel("Full-time")).toBe("unknown");
    expect(contractFromLabel("Internship")).toBe("internship");
    expect(contractFromLabel("Contract")).toBe("unknown");
    expect(contractFromLabel("Contractor")).toBe("freelance");
  });
  it("déduit la séniorité", () => {
    expect(detectSeniority("Senior Frontend Engineer", "")).toBe("senior");
    expect(detectSeniority("Lead Dev React", "")).toBe("lead");
    expect(detectSeniority("Développeur React", "5 ans d'expérience minimum")).toBe("senior");
    expect(detectSeniority("Développeur React", "Vous avez 2 ans d'expérience")).toBe("mid");
    expect(detectSeniority("Développeur React", "")).toBe("unknown");
  });
});

describe("parseSalary", () => {
  it.each([
    ["45k-55k€", 45000, 55000],
    ["45 000 € - 55 000 €", 45000, 55000],
    ["Annuel de 45000.00 Euros à 55000.00 Euros sur 12.0 mois", 45000, 55000],
    ["50K€", 50000, null],
  ] as const)("%s", (raw, min, max) => {
    expect(parseSalary(raw)).toEqual({ min, max, raw });
  });
  it("ignore les salaires mensuels ou journaliers", () => {
    expect(parseSalary("Mensuel de 3500 Euros")).toEqual({
      min: null,
      max: null,
      raw: "Mensuel de 3500 Euros",
    });
    expect(parseSalary(null)).toBeNull();
  });
});

describe("countryCodeFrom", () => {
  it("reconnaît codes et noms", () => {
    expect(countryCodeFrom("fr")).toBe("FR");
    expect(countryCodeFrom(" France")).toBe("FR");
    expect(countryCodeFrom("Atlantis")).toBeNull();
  });
});

describe("buildJob", () => {
  it("complète les champs manquants et valide le contrat", () => {
    const job = buildJob({
      externalId: "1",
      url: "https://example.com/jobs/1",
      title: "Senior React Developer (H/F)",
      companyName: "  Acme ",
      locationRaw: "Toulouse, France",
      descriptionText: "CDI, full remote. Stack : React, Next.js, TypeScript. Salaire : 50k-60k€",
      salaryRaw: "50k-60k€",
      publishedAt: "2026-09-01T10:00:00Z",
      raw: { id: 1 },
    });
    expect(job).toMatchObject({
      companyName: "Acme",
      countryCode: "FR",
      remotePolicy: "full_remote",
      remoteScope: "france",
      contractType: "cdi",
      seniority: "senior",
      salary: { min: 50000, max: 60000 },
    });
    expect(job.publishedAt).toBeInstanceOf(Date);
  });
  it("respecte les indices structurés", () => {
    const job = buildJob({
      externalId: "2",
      url: "https://example.com/jobs/2",
      title: "Frontend Engineer",
      descriptionText: "Full remote",
      remotePolicy: "hybrid",
      raw: {},
    });
    expect(job.remotePolicy).toBe("hybrid");
  });
});
