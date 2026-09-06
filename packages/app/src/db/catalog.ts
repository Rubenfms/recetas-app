import Dexie, { type Table } from 'dexie';
import type { CatalogCategory, CatalogProduct } from '@recetas/shared';
import { tokenize } from './search-tokens.js';

/**
 * Base de datos del CATÁLOGO.
 *
 * RESTRICCIÓN DURA: esto se borra y se rellena entero en cada actualización
 * del dataset. Por eso está separada de `recetas-user`, que no se toca nunca.
 * Aquí no se guarda ni un dato mío.
 */

/** Producto tal cual viene del dataset, más el índice de búsqueda offline. */
export interface StoredProduct extends CatalogProduct {
  /** Palabras normalizadas (sin acentos, minúsculas) de nombre y marca. */
  tokens: string[];
}

export interface CatalogMeta {
  key: string;
  value: unknown;
}

class CatalogDatabase extends Dexie {
  products!: Table<StoredProduct, string>;
  categories!: Table<CatalogCategory, number>;
  meta!: Table<CatalogMeta, string>;

  constructor() {
    super('recetas-catalog');
    this.version(1).stores({
      products: 'id, *tokens, ean, isFood',
      categories: 'id, parentId',
      meta: 'key',
    });
    // v2: el catálogo es solo de alimentación, así que el índice `isFood`
    // dejaba de separar nada. No hace falta migrar datos: el cargador detecta
    // el cambio de schemaVersion del dataset y lo reemplaza entero.
    this.version(2).stores({
      // `*tokens` es un índice multiEntry: es lo que hace la búsqueda offline.
      products: 'id, *tokens, ean',
      categories: 'id, parentId',
      meta: 'key',
    });
  }
}

export const catalogDb = new CatalogDatabase();

const META_GENERATED_AT = 'datasetGeneratedAt';
const META_SCHEMA_VERSION = 'datasetSchemaVersion';
const META_SOURCE = 'datasetSource';

export async function getLoadedDatasetStamp(): Promise<string | null> {
  const row = await catalogDb.meta.get(META_GENERATED_AT);
  return typeof row?.value === 'string' ? row.value : null;
}

/** Con qué versión del formato se guardó lo que hay en IndexedDB. */
export async function getLoadedSchemaVersion(): Promise<number | null> {
  const row = await catalogDb.meta.get(META_SCHEMA_VERSION);
  return typeof row?.value === 'number' ? row.value : null;
}

export async function getDatasetSource(): Promise<Record<string, unknown> | null> {
  const row = await catalogDb.meta.get(META_SOURCE);
  return (row?.value as Record<string, unknown> | undefined) ?? null;
}

export async function countProducts(): Promise<number> {
  return catalogDb.products.count();
}

/**
 * Reemplaza el catálogo entero en una sola transacción: o se sustituye del
 * todo o no se toca. Nunca abre la base de usuario.
 */
export async function replaceCatalog(
  products: CatalogProduct[],
  categories: CatalogCategory[],
  stamp: { generatedAt: string; schemaVersion: number; source: unknown },
  onProgress?: (inserted: number, total: number) => void,
): Promise<void> {
  const stored: StoredProduct[] = products.map((product) => ({
    ...product,
    tokens: tokenize(`${product.name} ${product.brand ?? ''}`),
  }));

  await catalogDb.transaction(
    'rw',
    catalogDb.products,
    catalogDb.categories,
    catalogDb.meta,
    async () => {
      await Promise.all([
        catalogDb.products.clear(),
        catalogDb.categories.clear(),
        catalogDb.meta.clear(),
      ]);

      // A trozos para poder ir informando del progreso: meter 4.300 registros
      // de golpe deja la pantalla congelada sin decir nada.
      const CHUNK = 500;
      for (let i = 0; i < stored.length; i += CHUNK) {
        await catalogDb.products.bulkAdd(stored.slice(i, i + CHUNK));
        onProgress?.(Math.min(i + CHUNK, stored.length), stored.length);
      }

      await catalogDb.categories.bulkAdd(categories);
      await catalogDb.meta.bulkPut([
        { key: META_GENERATED_AT, value: stamp.generatedAt },
        { key: META_SCHEMA_VERSION, value: stamp.schemaVersion },
        { key: META_SOURCE, value: stamp.source },
      ]);
    },
  );
}

export interface SearchOptions {
  limit: number;
}

/**
 * Búsqueda offline. Filtra por el índice multiEntry con el término más largo
 * (el más selectivo) y afina el resto en memoria.
 */
export async function searchProducts(
  query: string,
  opts: SearchOptions,
): Promise<StoredProduct[]> {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const pivot = terms.reduce((a, b) => (b.length > a.length ? b : a));
  const candidates = await catalogDb.products
    .where('tokens')
    .startsWith(pivot)
    .distinct()
    .toArray();

  const matches = candidates.filter((product) =>
    terms.every((term) => product.tokens.some((token) => token.startsWith(term))),
  );

  // Primero lo que empieza por lo que has escrito: buscando "leche" interesa
  // más "Leche semidesnatada" que "Batido de leche".
  const head = tokenize(query)[0] ?? '';
  matches.sort((a, b) => {
    const aStarts = a.tokens[0]?.startsWith(head) ? 0 : 1;
    const bStarts = b.tokens[0]?.startsWith(head) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name, 'es');
  });

  return matches.slice(0, opts.limit);
}

export async function getProduct(id: string): Promise<StoredProduct | undefined> {
  return catalogDb.products.get(id);
}

export async function getCategories(): Promise<CatalogCategory[]> {
  return catalogDb.categories.toArray();
}
