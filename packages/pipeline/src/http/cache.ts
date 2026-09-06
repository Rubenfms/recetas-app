import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE_DIR } from '../config.js';

/**
 * Caché en disco entre ejecuciones, indexada por URL.
 *
 * Es también el mecanismo de reanudación: si el crawl se corta a la mitad,
 * al relanzarlo todo lo ya descargado sale de aquí sin tocar la red.
 */
export interface CacheEntry {
  url: string;
  status: number;
  fetchedAt: string;
  body: string;
}

export const cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
};

function cachePath(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex');
  // Dos niveles de sharding: 4.300 ficheros en un solo directorio es lento en NTFS.
  return join(CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
}

export function readCache(url: string, maxAgeMs: number | null): CacheEntry | null {
  const path = cachePath(url);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    cacheStats.misses += 1;
    return null;
  }

  let entry: CacheEntry;
  try {
    entry = JSON.parse(text) as CacheEntry;
  } catch {
    // Entrada corrupta (p. ej. escritura interrumpida). Se trata como ausente.
    cacheStats.misses += 1;
    return null;
  }

  if (maxAgeMs !== null) {
    const age = Date.now() - Date.parse(entry.fetchedAt);
    if (!Number.isFinite(age) || age > maxAgeMs) {
      cacheStats.misses += 1;
      return null;
    }
  }

  cacheStats.hits += 1;
  return entry;
}

export function writeCache(url: string, status: number, body: string): void {
  const path = cachePath(url);
  mkdirSync(dirname(path), { recursive: true });
  const entry: CacheEntry = { url, status, fetchedAt: new Date().toISOString(), body };
  // Escritura atómica: si nos cortan a mitad no queda una entrada a medias.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(entry), 'utf8');
  renameSync(tmp, path);
  cacheStats.writes += 1;
}
