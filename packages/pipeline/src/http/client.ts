import { setTimeout as sleep } from 'node:timers/promises';
import {
  BLOCKED_RETRY_DELAY_MS,
  MAX_RETRIES,
  REQUEST_INTERVAL_MS,
  RETRY_BASE_DELAY_MS,
  USER_AGENT,
} from '../config.js';
import { log } from '../lib/log.js';

export interface RawResponse {
  status: number;
  body: string;
  /** Lo que pidió el servidor esperar, si lo dijo. */
  retryAfterMs?: number;
}

export const httpStats = {
  networkRequests: 0,
  retries: 0,
  blocked: 0,
  /** 429: el servidor nos ha frenado. Es normal con Open Food Facts. */
  throttled: 0,
};

/**
 * Cookies del sitio (Akamai pone `bm_sz` y `_abck`). No hacen falta para que
 * la API responda, pero mantenerlas nos hace parecer una sesión normal en vez
 * de 4.300 visitantes distintos.
 */
const cookies = new Map<string, string>();

function absorbCookies(res: Response): void {
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const pair = raw.split(';', 1)[0];
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(): string | undefined {
  if (cookies.size === 0) return undefined;
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * RESTRICCIÓN DURA: 1 petición/segundo y sin paralelismo.
 *
 * Se hace encadenando promesas en vez de con un semáforo, para que aunque
 * alguien llame a `httpGet` desde dos sitios a la vez las peticiones salgan
 * en serie y separadas en el tiempo, sin excepción.
 */
let queue: Promise<unknown> = Promise.resolve();
let lastRequestStartedAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export interface GetOptions {
  /** Separación mínima entre peticiones. Cada servicio tiene su ritmo. */
  intervalMs?: number;
  userAgent?: string;
  /** Las cookies solo tienen sentido con Mercadona, que va tras Akamai. */
  sendCookies?: boolean;
}

async function throttledFetch(url: string, opts: Required<GetOptions>): Promise<RawResponse> {
  const wait = opts.intervalMs - (Date.now() - lastRequestStartedAt);
  if (wait > 0) await sleep(wait);
  lastRequestStartedAt = Date.now();
  httpStats.networkRequests += 1;

  const cookie = opts.sendCookies ? cookieHeader() : undefined;
  const res = await fetch(url, {
    headers: {
      'User-Agent': opts.userAgent,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (opts.sendCookies) absorbCookies(res);
  return { status: res.status, body: await res.text(), retryAfterMs: retryAfterOf(res) };
}

/** Si el servidor dice cuánto esperar, se le hace caso antes que al backoff. */
function retryAfterOf(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds, 120) * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 120_000);
  return undefined;
}

/** ¿Merece la pena reintentar? Un 404 es una respuesta, no un fallo. */
function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Akamai. Reintentar rápido solo empeora las cosas. */
function isBlocked(status: number): boolean {
  return status === 403;
}

/**
 * GET con rate limit, reintentos y backoff exponencial con jitter.
 * Devuelve la respuesta aunque sea 404: decidir qué hacer con ella es del
 * llamante, no de aquí.
 */
export async function httpGet(url: string, options: GetOptions = {}): Promise<RawResponse> {
  const opts: Required<GetOptions> = {
    intervalMs: options.intervalMs ?? REQUEST_INTERVAL_MS,
    userAgent: options.userAgent ?? USER_AGENT,
    sendCookies: options.sendCookies ?? true,
  };
  let lastError: unknown;
  let serverAskedFor: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      httpStats.retries += 1;
      const backoff =
        serverAskedFor ??
        RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      log.warn(`reintento ${attempt}/${MAX_RETRIES} en ${Math.round(backoff / 1000)}s · ${url}`);
      await sleep(backoff);
      serverAskedFor = undefined;
    }

    try {
      const res = await enqueue(() => throttledFetch(url, opts));

      if (isBlocked(res.status)) {
        httpStats.blocked += 1;
        log.warn(
          `HTTP 403 (probablemente Akamai). Esperando ${BLOCKED_RETRY_DELAY_MS / 1000}s antes de seguir · ${url}`,
        );
        await sleep(BLOCKED_RETRY_DELAY_MS);
        lastError = new Error(`HTTP 403 en ${url}`);
        continue;
      }

      if (isRetryable(res.status)) {
        if (res.status === 429) httpStats.throttled += 1;
        serverAskedFor = res.retryAfterMs;
        lastError = new Error(`HTTP ${res.status} en ${url}`);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      log.warn(`fallo de red: ${err instanceof Error ? err.message : String(err)} · ${url}`);
    }
  }

  throw new Error(
    `No se pudo obtener ${url} tras ${MAX_RETRIES + 1} intentos. ` +
      `Último error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
