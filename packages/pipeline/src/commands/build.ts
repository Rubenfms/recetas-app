import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  DATASET_SCHEMA_VERSION,
  DatasetSchema,
  type CatalogCategory,
  type CatalogProduct,
  type Dataset,
} from '@recetas/shared';
import { API_BASE, DATASET_PATH, MAX_INVALID_PRODUCT_RATIO, RAW_DIR } from '../config.js';
import { log } from '../lib/log.js';
import { isFoodCategoryPath } from '../mercadona/food-categories.js';
import { ProductDetailSchema } from '../mercadona/schemas.js';
import { normalizeProduct } from '../normalize/product.js';
import type { RawDumpMeta } from './fetch.js';

/** El volcado fechado más reciente. */
export function latestRawDump(): string {
  if (!existsSync(RAW_DIR)) {
    throw new Error(
      `No hay ningún volcado crudo en ${RAW_DIR}. Ejecuta antes \`npm run pipeline:fetch\`.`,
    );
  }
  const dirs = readdirSync(RAW_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
    .filter((name) => statSync(join(RAW_DIR, name)).isDirectory())
    .sort();
  const last = dirs.at(-1);
  if (!last) {
    throw new Error(`No hay ningún volcado con fecha en ${RAW_DIR}.`);
  }
  return join(RAW_DIR, last);
}

export interface BuildReport {
  dumpDate: string;
  products: number;
  withNutrition: number;
  withoutEan: number;
  withNetContent: number;
  withPhotos: number;
  food: number;
  nonFood: number;
  invalid: number;
  duplicateEans: number;
  outputPath: string;
  outputBytes: number;
}

export function runBuild(dumpDir = latestRawDump()): BuildReport {
  log.step(`Construyendo dataset desde ${dumpDir}`);

  const metaPath = join(dumpDir, 'meta.json');
  if (!existsSync(metaPath)) {
    throw new Error(`Falta ${metaPath}. El volcado está incompleto o corrupto.`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as RawDumpMeta;
  if (!meta.finishedAt) {
    log.warn(
      'El volcado no llegó a terminar (meta.json sin finishedAt). Se construye ' +
        'con lo que hay, pero faltarán productos.',
    );
  }

  // ------------------------------------------------------------ categorías
  const categories: CatalogCategory[] = meta.categories.map((cat) => {
    const path = pathOfCategory(cat.id, meta.categories);
    return { ...cat, isFood: isFoodCategoryPath(path) };
  });

  // ------------------------------------------------------------ productos
  const productsDir = join(dumpDir, 'products');
  const files = existsSync(productsDir)
    ? readdirSync(productsDir).filter((f) => f.endsWith('.json'))
    : [];
  if (files.length === 0) {
    throw new Error(`No hay ninguna ficha en ${productsDir}.`);
  }

  const products: CatalogProduct[] = [];
  let invalid = 0;

  for (const file of files) {
    const id = basename(file, '.json');
    const text = readFileSync(join(productsDir, file), 'utf8');

    let parsed;
    try {
      parsed = ProductDetailSchema.safeParse(JSON.parse(text));
    } catch (err) {
      invalid += 1;
      log.error(`${file}: JSON ilegible (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }

    if (!parsed.success) {
      invalid += 1;
      const first = parsed.error.issues[0];
      log.error(
        `${file}: no encaja con el esquema · ` +
          `${first ? `${first.path.join('.') || '(raíz)'}: ${first.message}` : 'sin detalle'}`,
      );
      continue;
    }

    products.push(normalizeProduct(parsed.data, meta.discovery[id] ?? []));
  }

  // RESTRICCIÓN DURA: fallar de forma explícita, nunca en silencio. Una ficha
  // rara se tolera; un porcentaje alto significa que la API ha cambiado y no
  // vamos a publicar un dataset a medias sin decirlo.
  const invalidRatio = invalid / (invalid + products.length);
  if (invalidRatio > MAX_INVALID_PRODUCT_RATIO) {
    throw new Error(
      `${invalid} de ${invalid + products.length} fichas (${(invalidRatio * 100).toFixed(1)}%) ` +
        `no pasan la validación, por encima del umbral del ` +
        `${(MAX_INVALID_PRODUCT_RATIO * 100).toFixed(0)}%. La API de Mercadona ` +
        `ha cambiado de forma. No se genera el dataset.`,
    );
  }

  products.sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // ------------------------------------------------------------ informe
  const withNutrition = products.filter((p) => p.nutrition !== null).length;
  const withoutEan = products.filter((p) => p.ean === null).length;
  const withNetContent = products.filter((p) => p.netContent !== null).length;
  const withPhotos = products.filter((p) => p.photos.length > 0).length;
  const food = products.filter((p) => p.isFood).length;

  const eanSeen = new Map<string, number>();
  for (const p of products) {
    if (p.ean) eanSeen.set(p.ean, (eanSeen.get(p.ean) ?? 0) + 1);
  }
  const duplicateEans = [...eanSeen.values()].filter((n) => n > 1).length;

  const dataset: Dataset = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'mercadona',
      apiBase: API_BASE,
      postalCode: meta.postalCode,
      warehouse: meta.warehouse,
      rawDump: basename(dumpDir),
    },
    counts: {
      products: products.length,
      withNutrition,
      withoutEan,
      withNetContent,
      food,
      nonFood: products.length - food,
      withPhotos,
    },
    categories,
    products,
  };

  // El dataset se valida contra su propio contrato antes de escribirlo: si la
  // PWA no lo va a poder leer, mejor enterarse aquí.
  const check = DatasetSchema.safeParse(dataset);
  if (!check.success) {
    const first = check.error.issues[0];
    throw new Error(
      `El dataset generado no cumple su propio esquema · ` +
        `${first ? `${first.path.join('.')}: ${first.message}` : 'sin detalle'}`,
    );
  }

  mkdirSync(dirname(DATASET_PATH), { recursive: true });
  const json = JSON.stringify(dataset);
  const tmp = `${DATASET_PATH}.tmp`;
  writeFileSync(tmp, json, 'utf8');
  renameSync(tmp, DATASET_PATH);

  return {
    dumpDate: basename(dumpDir),
    products: products.length,
    withNutrition,
    withoutEan,
    withNetContent,
    withPhotos,
    food,
    nonFood: products.length - food,
    invalid,
    duplicateEans,
    outputPath: DATASET_PATH,
    outputBytes: Buffer.byteLength(json, 'utf8'),
  };
}

function pathOfCategory(
  id: number,
  all: readonly RawDumpMeta['categories'][number][],
): number[] {
  const path: number[] = [];
  const seen = new Set<number>();
  let current = all.find((c) => c.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.id);
    const parentId = current.parentId;
    current = parentId === null ? undefined : all.find((c) => c.id === parentId);
  }
  return path;
}
