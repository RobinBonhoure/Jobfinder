import { setTimeout as sleep } from "node:timers/promises";

export const USER_AGENT = "JobHunt/0.1 (usage personnel; +mailto:robin.bonhoure@outlook.fr)";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    // Le corps n'est cité que s'il est court et non-HTML (message d'API utile, pas une page d'erreur).
    const detail = body && !/^\s*</.test(body) ? ` — ${body.slice(0, 200)}` : "";
    super(`HTTP ${status} sur ${url}${detail}`);
    this.name = "HttpError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  signal?: AbortSignal;
  retries?: number;
  /** Codes non-2xx à renvoyer tels quels plutôt qu'en erreur (ex. 206 France Travail, 404 robots.txt). */
  acceptStatus?: number[];
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
  url: string;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function retryAfterMs(headers: Headers): number | null {
  const v = headers.get("retry-after");
  if (!v) return null;
  const seconds = Number(v);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 120_000);
  const date = Date.parse(v);
  return Number.isNaN(date) ? null : Math.max(0, Math.min(date - Date.now(), 120_000));
}

/**
 * Client HTTP partagé : timeout, retry exponentiel (429/5xx/réseau, Retry-After respecté),
 * délai minimal entre deux requêtes vers le même hôte, User-Agent identifiable.
 */
export class HttpClient {
  private readonly lastCallByHost = new Map<string, number>();
  private readonly minIntervalByHost = new Map<string, number>();
  calls = 0;

  constructor(private readonly defaultMinIntervalMs = 250) {}

  setHostInterval(host: string, ms: number): void {
    this.minIntervalByHost.set(host, ms);
  }

  private async throttle(url: URL, signal?: AbortSignal): Promise<void> {
    const host = url.host;
    const interval = this.minIntervalByHost.get(host) ?? this.defaultMinIntervalMs;
    const last = this.lastCallByHost.get(host) ?? 0;
    const wait = last + interval - Date.now();
    this.lastCallByHost.set(host, Math.max(Date.now(), last + interval));
    if (wait > 0) await sleep(wait, undefined, { signal });
  }

  async request(url: string, opts: RequestOptions = {}): Promise<HttpResponse> {
    const target = new URL(url);
    const retries = opts.retries ?? 3;
    let attempt = 0;
    for (;;) {
      await this.throttle(target, opts.signal);
      this.calls++;
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 20_000);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
      try {
        const res = await fetch(target, {
          method: opts.method ?? "GET",
          headers: { "user-agent": USER_AGENT, accept: "application/json, text/*;q=0.8", ...opts.headers },
          body: opts.body,
          signal,
          redirect: "follow",
        });
        const text = opts.method === "HEAD" ? "" : await res.text();
        if (res.ok || opts.acceptStatus?.includes(res.status)) {
          return { status: res.status, headers: res.headers, text, url: res.url };
        }
        if (RETRYABLE.has(res.status) && attempt < retries) {
          await sleep(retryAfterMs(res.headers) ?? backoff(attempt), undefined, { signal: opts.signal });
          attempt++;
          continue;
        }
        throw new HttpError(res.status, url, text);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        if (opts.signal?.aborted) throw err;
        if (attempt >= retries) throw err;
        await sleep(backoff(attempt), undefined, { signal: opts.signal });
        attempt++;
      }
    }
  }

  async getJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.request(url, opts);
    try {
      return JSON.parse(res.text) as T;
    } catch {
      throw new Error(`Réponse non JSON sur ${url} : ${res.text.slice(0, 120)}`);
    }
  }

  async getText(url: string, opts: RequestOptions = {}): Promise<string> {
    return (await this.request(url, opts)).text;
  }
}

/** 1 s, 4 s, 16 s… avec gigue. */
function backoff(attempt: number): number {
  const base = 1000 * 4 ** attempt;
  return base + Math.floor(Math.random() * base * 0.25);
}
