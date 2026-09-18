// Capture manuelle (PLAN §8.2) : uniquement sur clic, uniquement l'onglet actif, texte déjà affiché.
// Le serveur JobHunt ne requête jamais le site capturé.

const DEFAULTS = { apiUrl: "http://127.0.0.1:3000", token: "" };

async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { apiUrl: stored.apiUrl.replace(/\/$/, ""), token: stored.token };
}

async function setBadge(tabId, text, color, title) {
  await chrome.action.setBadgeText({ tabId, text });
  if (color) await chrome.action.setBadgeBackgroundColor({ tabId, color });
  if (title) await chrome.action.setTitle({ tabId, title });
}

/** Exécuté dans la page : sélection de l'utilisateur, sinon panneau d'offre connu, sinon page entière. */
function readPage() {
  const selection = String(window.getSelection() ?? "").trim();
  if (selection.length >= 200) {
    return { text: selection, selectionOnly: true };
  }
  const selectors = [
    ".jobs-search__job-details", // LinkedIn, vue liste
    ".jobs-details", // LinkedIn, vue offre
    "[data-testid='job-section-description']", // Welcome to the Jungle
    "main",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.innerText?.trim();
    if (text && text.length >= 300) return { text, selectionOnly: false };
  }
  return { text: document.body.innerText.trim(), selectionOnly: false };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith("http")) return;
  const tabId = tab.id;
  const { apiUrl, token } = await settings();
  if (!token) {
    await setBadge(tabId, "!", "#b45309", "Configure le token dans les options de l'extension");
    chrome.runtime.openOptionsPage();
    return;
  }
  await setBadge(tabId, "…", "#0369a1", "Envoi en cours…");

  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
    const page = injection?.result;
    if (!page?.text) throw new Error("Texte de la page illisible");

    const res = await fetch(`${apiUrl}/api/capture`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        url: tab.url,
        pageTitle: tab.title ?? "",
        text: page.text.slice(0, 200_000),
        selectionOnly: page.selectionOnly,
        capturedAt: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);

    const label =
      data.status === "duplicate"
        ? "déjà capturée"
        : data.score != null
          ? `score ${data.score}`
          : "enregistrée";
    await setBadge(
      tabId,
      data.score != null ? String(data.score) : "OK",
      "#047857",
      `JobHunt : ${label}${data.warning ? ` — ${data.warning}` : ""}`,
    );
    await chrome.tabs.create({ url: `${apiUrl}${data.url}`, index: tab.index + 1, active: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setBadge(tabId, "ERR", "#b91c1c", `JobHunt : échec — ${message}`);
  }
});
