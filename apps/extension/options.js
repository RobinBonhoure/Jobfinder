const DEFAULTS = { apiUrl: "http://127.0.0.1:3000", token: "" };
const $ = (id) => document.getElementById(id);
const status = (text, ok = true) => {
  $("status").textContent = text;
  $("status").style.color = ok ? "#047857" : "#b91c1c";
};

const stored = await chrome.storage.local.get(DEFAULTS);
$("apiUrl").value = stored.apiUrl;
$("token").value = stored.token;

$("save").addEventListener("click", async () => {
  const apiUrl = $("apiUrl").value.trim().replace(/\/$/, "") || DEFAULTS.apiUrl;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):3000$/.test(apiUrl)) {
    status(
      "Seules http://127.0.0.1:3000 et http://localhost:3000 sont autorisées (voir manifest.json).",
      false,
    );
    return;
  }
  await chrome.storage.local.set({ apiUrl, token: $("token").value.trim() });
  status("Enregistré.");
});

$("test").addEventListener("click", async () => {
  const apiUrl = $("apiUrl").value.trim().replace(/\/$/, "");
  try {
    const res = await fetch(`${apiUrl}/api/health`);
    const data = await res.json();
    status(
      data.ok
        ? `Connecté. Worker : ${data.worker.stale ? "en retard ou arrêté" : "OK"} · scoring ${data.worker.scoringEnabled ? "actif" : "désactivé"}.`
        : "JobHunt répond mais la base est injoignable.",
      data.ok,
    );
  } catch (err) {
    status(`JobHunt injoignable : ${err.message}. L'app tourne-t-elle (pnpm dev) ?`, false);
  }
});
