import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSTAL_CODE, RAW_DIR, WAREHOUSE } from '../config.js';
import { cacheStats } from '../http/cache.js';
import { httpStats } from '../http/client.js';
import { Progress, formatDuration, log } from '../lib/log.js';
import {
  ApiSchemaError,
  apiDrift,
  getCategoriesIndex,
  getCategory,
  getProduct,
  validatePostalCode,
} from '../mercadona/api.js';

export interface RawDumpMeta {
  postalCode: string;
  warehouse: string;
  startedAt: string;
  finishedAt: string | null;
  /** Ruta de ids (nivel 0 → dentro) por la que se descubrió cada producto. */
  discovery: Record<string, number[]>;
  categories: { id: number; name: string; level: number; parentId: number | null }[];
  /** Productos que estaban en el listado pero cuya ficha no se pudo obtener. */
  failures: { id: string; reason: string }[];
}

export interface FetchOptions {
  /** Refresca lo cacheado más viejo que esto. `null` = la caché nunca caduca. */
  maxAgeMs: number | null;
  /** Ignora la caché y el volcado previo y lo vuelve a pedir todo. */
  force: boolean;
  /** Corta tras N fichas. Para probar sin esperar 80 minutos. */
  limit: number | null;
}

/** Directorio del volcado del día. Relanzar el mismo día continúa en él. */
export function rawDumpDir(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return join(RAW_DIR, day);
}

function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, path);
}

export async function runFetch(opts: FetchOptions): Promise<string> {
  const startedAt = Date.now();
  const dir = rawDumpDir();
  mkdirSync(join(dir, 'categories'), { recursive: true });
  mkdirSync(join(dir, 'products'), { recursive: true });

  const metaPath = join(dir, 'meta.json');
  const meta: RawDumpMeta = existsSync(metaPath) && !opts.force
    ? (JSON.parse(readFileSync(metaPath, 'utf8')) as RawDumpMeta)
    : {
        postalCode: POSTAL_CODE,
        warehouse: WAREHOUSE ?? 'default',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        discovery: {},
        categories: [],
        failures: [],
      };
  meta.finishedAt = null;
  meta.failures = [];

  log.step(`Volcado crudo en ${dir}`);
  log.info(`CP ${POSTAL_CODE} · almacén ${WAREHOUSE ?? 'por defecto'} · 1 petición/segundo`);

  // -------------------------------------------------------------- CP
  const validPostalCode = await validatePostalCode();
  if (!validPostalCode) {
    throw new Error(
      `Mercadona no reparte en el código postal ${POSTAL_CODE}. ` +
        `Revisa POSTAL_CODE en packages/pipeline/src/config.ts.`,
    );
  }
  log.info(`Código postal ${POSTAL_CODE} validado contra la API.`);

  // -------------------------------------------------------------- categorías
  log.step('Árbol de categorías');
  const index = await getCategoriesIndex(opts.force ? 0 : opts.maxAgeMs);
  writeFileSync(join(dir, 'categories.json'), index.raw, 'utf8');

  const categories: RawDumpMeta['categories'] = [];
  const subCategories: { id: number; name: string; topId: number }[] = [];

  for (const top of index.data.results) {
    categories.push({ id: top.id, name: top.name, level: 0, parentId: null });
    for (const sub of top.categories ?? []) {
      categories.push({ id: sub.id, name: sub.name, level: 1, parentId: top.id });
      subCategories.push({ id: sub.id, name: sub.name, topId: top.id });
    }
  }
  log.info(
    `${categories.filter((c) => c.level === 0).length} categorías de nivel 0, ` +
      `${subCategories.length} de nivel 1.`,
  );

  // -------------------------------------------------------------- listados
  log.step('Listados de categoría (de aquí salen los ids de producto)');
  const discovery = new Map<string, number[]>(
    Object.entries(opts.force ? {} : meta.discovery),
  );
  const listingProgress = new Progress(subCategories.length, 'Categorías', 20);

  for (const sub of subCategories) {
    const path = join(dir, 'categories', `${sub.id}.json`);
    const fetched = await getCategory(sub.id, opts.force ? 0 : opts.maxAgeMs);
    writeFileSync(path, fetched.raw, 'utf8');

    const leaves = fetched.data.categories ?? [];
    const direct = fetched.data.products ?? [];
    let found = 0;

    const record = (productId: string, leafId: number | null): void => {
      const route = leafId === null ? [sub.topId, sub.id] : [sub.topId, sub.id, leafId];
      // El primer sitio donde se ve un producto manda: los duplicados entre
      // categorías son habituales y da igual cuál gane, pero tiene que ser
      // determinista.
      if (!discovery.has(productId)) discovery.set(productId, route);
      found += 1;
    };

    for (const product of direct) record(product.id, null);
    for (const leaf of leaves) {
      if (!categories.some((c) => c.id === leaf.id)) {
        categories.push({ id: leaf.id, name: leaf.name, level: 2, parentId: sub.id });
      }
      for (const product of leaf.products ?? []) record(product.id, leaf.id);
    }

    listingProgress.tick(!fetched.fromCache, `${sub.name}: ${found}`);
  }

  meta.categories = categories;
  meta.discovery = Object.fromEntries(discovery);
  writeJson(metaPath, meta);
  log.info(`${discovery.size} productos únicos en los listados.`);

  // -------------------------------------------------------------- fichas
  log.step('Fichas de producto (única fuente de EAN, fotos e ingredientes)');
  // Orden determinista: por ruta de categoría y luego por id. No vale el orden
  // del Map, porque `meta.discovery` pasa por JSON y los objetos de JS
  // reordenan las claves que parecen enteros — que es justo lo que son los ids
  // de producto. Sin esto, una ejecución reanudada recorre el catálogo en otro
  // orden que una fresca, y los saltos salen desperdigados en vez de seguidos.
  const routeOf = (id: string): string => (discovery.get(id) ?? []).join('.');
  const ids = [...discovery.keys()].sort(
    (a, b) => routeOf(a).localeCompare(routeOf(b)) || a.localeCompare(b),
  );
  const target = opts.limit ? ids.slice(0, opts.limit) : ids;
  const productProgress = new Progress(target.length, 'Fichas', 50);

  let invalid = 0;
  let missing = 0;
  let processed = 0;

  for (const id of target) {
    processed += 1;
    const path = join(dir, 'products', `${id}.json`);

    // Reanudación: si la ficha ya está en el volcado de hoy, ni caché ni red.
    if (!opts.force && existsSync(path)) {
      productProgress.tick(false);
      continue;
    }

    try {
      const fetched = await getProduct(id, opts.force ? 0 : opts.maxAgeMs);
      if (!fetched) {
        missing += 1;
        meta.failures.push({ id, reason: 'HTTP 404: la ficha ya no existe' });
        productProgress.tick(true);
        continue;
      }
      writeFileSync(path, fetched.raw, 'utf8');
      productProgress.tick(!fetched.fromCache);
    } catch (err) {
      if (err instanceof ApiSchemaError) {
        invalid += 1;
        meta.failures.push({ id, reason: err.message.split('\n')[0] ?? 'esquema inválido' });
        log.error(`Producto ${id}: ${err.message}`);
        productProgress.tick(true);
        continue;
      }
      // Un fallo de red que ha agotado los reintentos no es recuperable aquí.
      // Se guarda el progreso para poder reanudar y se corta.
      meta.failures.push({ id, reason: err instanceof Error ? err.message : String(err) });
      writeJson(metaPath, meta);
      throw err;
    }

    // La reanudación se apoya en los ficheros de ficha, que ya están escritos.
    // Esto solo evita perder la lista de fallos si nos cortan a mitad.
    if (processed % 200 === 0) writeJson(metaPath, meta);
  }

  meta.finishedAt = new Date().toISOString();
  writeJson(metaPath, meta);

  // -------------------------------------------------------------- resumen
  const elapsed = Date.now() - startedAt;
  log.step('Descarga terminada');
  log.info(`Duración: ${formatDuration(elapsed)}`);
  log.info(
    `Peticiones a la red: ${httpStats.networkRequests} · caché: ${cacheStats.hits} aciertos · ` +
      `reintentos: ${httpStats.retries} · bloqueos 403: ${httpStats.blocked}`,
  );
  if (missing > 0) log.warn(`${missing} fichas devolvieron 404 y se han descartado.`);
  if (invalid > 0) {
    log.error(`${invalid} fichas no pasaron la validación de Zod. Están listadas en meta.json.`);
  }
  if (apiDrift.unknownProductKeys.size > 0) {
    log.warn(
      `Campos nuevos en las fichas que el esquema no conocía: ` +
        `${[...apiDrift.unknownProductKeys].join(', ')}. La API ha cambiado; ` +
        `no rompe nada, pero míralo.`,
    );
  }

  return dir;
}
