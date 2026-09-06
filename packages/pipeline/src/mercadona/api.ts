import type { z } from 'zod';
import { API_BASE, POSTAL_CODE, WAREHOUSE } from '../config.js';
import { httpGet, httpStats } from '../http/client.js';
import { readCache, writeCache } from '../http/cache.js';
import {
  CategoriesIndexSchema,
  CategoryDetailSchema,
  KNOWN_PRODUCT_KEYS,
  ProductDetailSchema,
  type CategoriesIndex,
  type CategoryDetail,
  type ProductDetail,
} from './schemas.js';

/** Claves nuevas vistas en las fichas. Se reportan al final. */
export const apiDrift = {
  unknownProductKeys: new Set<string>(),
};

export class ApiSchemaError extends Error {
  constructor(url: string, error: z.ZodError) {
    const detail = error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(raíz)';
        return `  · ${path}: ${issue.message}`;
      })
      .join('\n');
    super(
      `La respuesta de ${url} no encaja con el esquema esperado.\n${detail}\n\n` +
        `La API interna de Mercadona no es oficial y puede cambiar sin aviso. ` +
        `Revisa packages/pipeline/src/mercadona/schemas.ts y compáralo con el ` +
        `volcado crudo antes de tocar nada más.`,
    );
    this.name = 'ApiSchemaError';
  }
}

export class ApiHttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = 'ApiHttpError';
  }
}

function withParams(path: string): string {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('lang', 'es');
  if (WAREHOUSE) url.searchParams.set('wh', WAREHOUSE);
  return url.toString();
}

export interface Fetched<T> {
  data: T;
  /** Texto exacto que devolvió la API, para el volcado crudo. */
  raw: string;
  fromCache: boolean;
}

/**
 * GET + caché + validación Zod. Es el único camino por el que entran datos
 * externos al pipeline.
 */
async function getValidated<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  opts: { maxAgeMs: number | null; allow404?: boolean },
): Promise<Fetched<z.infer<S>> | null> {
  const url = withParams(path);

  let status: number;
  let body: string;
  let fromCache: boolean;

  const cached = readCache(url, opts.maxAgeMs);
  if (cached) {
    ({ status, body } = cached);
    fromCache = true;
  } else {
    const res = await httpGet(url);
    ({ status, body } = res);
    fromCache = false;
    // Solo se cachean respuestas concluyentes: un 404 también lo es.
    if (status === 200 || status === 404) writeCache(url, status, body);
  }

  if (status === 404 && opts.allow404) return null;
  if (status !== 200) throw new ApiHttpError(url, status);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(
      `${url} devolvió algo que no es JSON (HTTP ${status}). ` +
        `Primeros 200 caracteres: ${body.slice(0, 200)}`,
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiSchemaError(url, parsed.error);

  return { data: parsed.data, raw: body, fromCache };
}

/** Sin `allow404`, `getValidated` solo devuelve `null` en un 404 permitido. */
export async function getCategoriesIndex(
  maxAgeMs: number | null,
): Promise<Fetched<CategoriesIndex>> {
  const result = await getValidated('/categories/', CategoriesIndexSchema, { maxAgeMs });
  if (!result) throw new Error('El índice de categorías devolvió 404.');
  return result;
}

export async function getCategory(
  id: number,
  maxAgeMs: number | null,
): Promise<Fetched<CategoryDetail>> {
  const result = await getValidated(`/categories/${id}/`, CategoryDetailSchema, { maxAgeMs });
  if (!result) throw new Error(`La categoría ${id} devolvió 404.`);
  return result;
}

export async function getProduct(
  id: string,
  maxAgeMs: number | null,
): Promise<Fetched<ProductDetail> | null> {
  const result = await getValidated(`/products/${id}/`, ProductDetailSchema, {
    maxAgeMs,
    allow404: true,
  });
  if (result) recordDrift(result.raw);
  return result;
}

function recordDrift(raw: string): void {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (!KNOWN_PRODUCT_KEYS.has(key)) apiDrift.unknownProductKeys.add(key);
    }
  } catch {
    // El JSON ya se validó antes de llegar aquí; si falla, no es asunto de esto.
  }
}

/**
 * Comprueba que el CP existe para Mercadona. Devuelve `true` si está dentro de
 * su zona de reparto. No revela el almacén: ver ARCHITECTURE.md.
 */
export async function validatePostalCode(postalCode = POSTAL_CODE): Promise<boolean> {
  const url = `${API_BASE}/postal-codes/actions/change-pc/`;
  // Va por `fetch` directo y no por `httpGet` porque es un POST y es una sola
  // petición por ejecución, pero cuenta igual: un contador que se deja fuera
  // peticiones reales miente justo donde importa.
  httpStats.networkRequests += 1;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: 'https://tienda.mercadona.es',
      Referer: 'https://tienda.mercadona.es/',
    },
    body: JSON.stringify({ new_postal_code: postalCode }),
  });
  await res.text();
  return res.status === 200;
}
