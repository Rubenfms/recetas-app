import { OFF_API_BASE, OFF_REQUEST_INTERVAL_MS, OFF_USER_AGENT } from '../config.js';
import { readCache, writeCache } from '../http/cache.js';
import { httpGet } from '../http/client.js';
import { OffResponseSchema, type OffResponse } from './schemas.js';

export interface OffResult {
  response: OffResponse;
  raw: string;
  fromCache: boolean;
}

/**
 * Ficha de Open Food Facts por código de barras.
 *
 * Devuelve `null` solo cuando OFF contesta que no conoce el producto, que es
 * un desenlace esperado en un tercio del catálogo. Un fallo de red o un
 * esquema roto sí lanzan.
 */
export async function getByEan(ean: string, maxAgeMs: number | null): Promise<OffResult | null> {
  // Pedir solo lo que se usa: la ficha completa de OFF son cientos de campos.
  const url =
    `${OFF_API_BASE}/product/${encodeURIComponent(ean)}.json` +
    `?fields=code,product_name,brands,nutriments`;

  let status: number;
  let body: string;
  let fromCache: boolean;

  const cached = readCache(url, maxAgeMs);
  if (cached) {
    ({ status, body } = cached);
    fromCache = true;
  } else {
    const res = await httpGet(url, {
      intervalMs: OFF_REQUEST_INTERVAL_MS,
      userAgent: OFF_USER_AGENT,
      sendCookies: false,
    });
    ({ status, body } = res);
    fromCache = false;
    if (status === 200 || status === 404) writeCache(url, status, body);
  }

  if (status === 404) return null;
  if (status !== 200) throw new Error(`Open Food Facts devolvió HTTP ${status} para el EAN ${ean}`);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(
      `Open Food Facts devolvió algo que no es JSON para el EAN ${ean}. ` +
        `Primeros 200 caracteres: ${body.slice(0, 200)}`,
    );
  }

  const parsed = OffResponseSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `La respuesta de Open Food Facts para el EAN ${ean} no encaja con el esquema` +
        (first ? ` (${first.path.join('.') || 'raíz'}: ${first.message})` : '') +
        '. Revisa packages/pipeline/src/openfoodfacts/schemas.ts.',
    );
  }

  if (parsed.data.status !== 1 || !parsed.data.product) return null;
  return { response: parsed.data, raw: body, fromCache };
}
