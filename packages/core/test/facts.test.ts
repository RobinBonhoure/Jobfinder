import { describe, expect, it } from "vitest";
import { contractFact, remoteFact, scoreLevel } from "../src/domain/facts";

describe("scoreLevel", () => {
  it("applique les seuils 80 / 65 / 50", () => {
    expect([80, 79, 65, 64, 50, 49].map(scoreLevel)).toEqual([
      "excellent",
      "good",
      "good",
      "fair",
      "fair",
      "weak",
    ]);
  });
});

describe("contractFact", () => {
  it("CDI conforme, contrat inconnu à vérifier, autre contrat bloquant", () => {
    expect(contractFact("cdi")).toEqual({ label: "CDI", tone: "good" });
    expect(contractFact("unknown").tone).toBe("warn");
    expect(contractFact("cdd")).toEqual({ label: "CDD", tone: "bad" });
  });

  it("le verdict LLM tranche un contrat inconnu", () => {
    expect(contractFact("unknown", "cdi").tone).toBe("good");
    expect(contractFact("unknown", "not_cdi")).toEqual({ label: "Pas un CDI", tone: "bad" });
    expect(contractFact("cdi", "not_cdi").tone).toBe("bad");
  });
});

describe("remoteFact", () => {
  it("le verdict LLM prime sur la politique déclarée", () => {
    expect(remoteFact("unknown", "full_remote_france_ok")).toEqual({
      label: "Full remote France",
      tone: "good",
    });
    expect(remoteFact("full_remote", "remote_but_geo_incompatible")).toEqual({
      label: "Remote hors zone",
      tone: "bad",
    });
    expect(remoteFact("hybrid", "unclear").tone).toBe("warn");
  });

  it("sans verdict, se fonde sur la politique", () => {
    expect(remoteFact("full_remote").tone).toBe("good");
    expect(remoteFact("unknown").tone).toBe("warn");
    expect(remoteFact("onsite").tone).toBe("bad");
  });
});
