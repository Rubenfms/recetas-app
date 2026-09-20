import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { cacheStats } from '../http/cache.js';
import { httpStats } from '../http/client.js';
import { Progress, formatDuration, log } from '../lib/log.js';
import { getByEan } from '../openfoodfacts/api.js';
import { isFoodCategoryPath } from '../mercadona/food-categories.js';
import { ProductDetailSchema } from '../mercadona/schemas.js';
import { categoryPathOf } from '../normalize/product.js';
import { latestRawDump } from './build.js';

export interface EnrichOptions {
  maxAgeMs: number | null;
  force: boolean;
  limit: number | null;
}

/**
 * Un EAN que empieza por 2 está en el rango que GS1 reserva para códigos
 * internos de tienda: peso variable, obrador, bandejas pesadas en caja. No
 * identifican un producto a nivel mundial, así que Open Food Facts nunca los
 * va a conocer. Preguntar por ellos son 244 peticiones tiradas a un servicio
 * gratuito.
 */
function isInternalCode(ean: string): boolean {
  return ean.startsWith('2');
}

interface EanTarget {
  ean: string;
  name: string;
  /** Id de producto: ordena de forma estable y mezcla categorías. */
  id: string;
}

interface EanSelection {
  targets: EanTarget[];
  skippedNonFood: number;
  skippedInternal: number;
  withoutEan: number;
}

/**
 * Los EAN que merece la pena preguntar: solo alimentación, sin códigos
 * internos y sin duplicados.
 *
 * El volcado crudo puede ser anterior a acotar el scope y traer limpieza y
 * cosmética; pedir sus macros sería una hora de reloj para productos que ni
 * salen en el dataset.
 */
function selectEans(dumpDir: string): EanSelection {
  const productsDir = join(dumpDir, 'products');
  if (!existsSync(productsDir)) {
    throw new Error(`No hay fichas en ${productsDir}. Ejecuta antes \`npm run pipeline:fetch\`.`);
  }

  const metaPath = join(dumpDir, 'meta.json');
  const meta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, 'utf8')) as { discovery?: Record<string, number[]> })
    : {};

  const seen = new Map<string, EanTarget>();
  let skippedNonFood = 0;
  let skippedInternal = 0;
  let withoutEan = 0;

  for (const file of readdirSync(productsDir).filter((f) => f.endsWith('.json'))) {
    const parsed = ProductDetailSchema.safeParse(
      JSON.parse(readFileSync(join(productsDir, file), 'utf8')),
    );
    if (!parsed.success) continue;

    const id = parsed.data.id;
    const path = categoryPathOf(parsed.data.categories, meta.discovery?.[id] ?? []);
    if (!isFoodCategoryPath(path)) {
      skippedNonFood += 1;
      continue;
    }

    const ean = parsed.data.ean?.trim();
    if (!ean) {
      withoutEan += 1;
      continue;
    }
    if (isInternalCode(ean)) {
      skippedInternal += 1;
      continue;
    }
    // Varios productos pueden compartir EAN (20 en el catálogo actual): se
    // pide una vez y el `build` la reparte entre todos.
    if (!seen.has(ean)) seen.set(ean, { ean, name: parsed.data.display_name, id });
  }

  const targets = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { targets, skippedNonFood, skippedInternal, withoutEan };
}

/**
 * Cruza el catálogo con Open Food Facts por código de barras y guarda las
 * respuestas crudas junto al volcado de Mercadona.
 *
 * Igual que el crawl: una petición cada vez, caché en disco, reanudable. OFF
 * frena más que Mercadona, así que va a 2,5 s por petición; el pase completo
 * son un par de horas la primera vez y segundos las siguientes.
 */
export async function runEnrich(opts: EnrichOptions): Promise<string> {
  const startedAt = Date.now();
  const dumpDir = latestRawDump();
  const offDir = join(dumpDir, 'off');
  mkdirSync(offDir, { recursive: true });

  log.step(`Cruce con Open Food Facts sobre ${basename(dumpDir)}`);

  const selection = selectEans(dumpDir);
  const all = selection.targets;
  const target = opts.limit ? all.slice(0, opts.limit) : all;

  log.info(`${all.length} códigos de barras que preguntar${opts.limit ? `, se piden ${target.length}` : ''}.`);
  log.info(
    `Descartados: ${selection.skippedNonFood} fichas que no son alimentación, ` +
      `${selection.skippedInternal} códigos internos de tienda (empiezan por 2, ` +
      `Open Food Facts no los conoce) y ${selection.withoutEan} sin EAN.`,
  );
  // 2,5 s de separación más las esperas de 10 s cuando OFF frena con un 429:
  // medido sobre un pase real, salen unos 4 s por petición, no 2,5.
  log.info(
    `2,5 s entre peticiones, más lo que OFF frene. ` +
      `Estimado real: ~${formatDuration(target.length * 4000)}.`,
  );

  const progress = new Progress(target.length, 'EAN', 50);
  let found = 0;
  let missing = 0;

  for (const { ean } of target) {
    const path = join(offDir, `${ean}.json`);

    // Reanudación: lo que ya está en el volcado de hoy no se vuelve a pedir.
    if (!opts.force && existsSync(path)) {
      progress.tick(false);
      found += 1;
      continue;
    }
    const missPath = join(offDir, `${ean}.404`);
    if (!opts.force && existsSync(missPath)) {
      progress.tick(false);
      missing += 1;
      continue;
    }

    const result = await getByEan(ean, opts.force ? 0 : opts.maxAgeMs);
    if (result) {
      writeFileSync(path, result.raw, 'utf8');
      found += 1;
      progress.tick(!result.fromCache);
    } else {
      // Marcador vacío: que OFF no conozca un producto también es un dato, y
      // guardarlo evita volver a preguntarlo en cada ejecución.
      writeFileSync(missPath, '', 'utf8');
      missing += 1;
      progress.tick(true);
    }
  }

  const elapsed = Date.now() - startedAt;
  log.step('Cruce terminado');
  log.info(`Duración: ${formatDuration(elapsed)}`);
  log.info(
    `Encontrados en OFF: ${found} · no están: ${missing} ` +
      `(${((found / Math.max(1, found + missing)) * 100).toFixed(1)}% de cobertura)`,
  );
  log.info(
    `Peticiones a la red: ${httpStats.networkRequests} · caché: ${cacheStats.hits} aciertos · ` +
      `reintentos: ${httpStats.retries} · frenadas por OFF: ${httpStats.throttled}`,
  );
  log.info('Ejecuta ahora `npm run pipeline:build` para meter los macros en el dataset.');

  return offDir;
}
