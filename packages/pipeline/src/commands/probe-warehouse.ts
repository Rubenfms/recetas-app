import { API_BASE, POSTAL_CODE } from '../config.js';
import { httpGet } from '../http/client.js';
import { log } from '../lib/log.js';
import { validatePostalCode } from '../mercadona/api.js';

/**
 * Un `?wh=` inválido no da error: se ignora y la API devuelve el catálogo por
 * defecto. Eso significa que no se puede comprobar un código de almacén
 * mirando si responde 200.
 *
 * Lo que sí se puede hacer es comparar contra un código deliberadamente falso.
 * Si `wh=CANDIDATO` devuelve algo distinto de `wh=ZZZ9`, el candidato existe y
 * apunta a un almacén con catálogo propio. Si devuelve exactamente lo mismo, o
 * no existe o sirve el mismo catálogo — y en ambos casos da igual cuál usemos.
 *
 * Se sondea sobre categorías con variación regional conocida (fruta, verdura,
 * pescado fresco, panadería), que son donde aparecen las diferencias.
 */
const CONTROL_WAREHOUSE = 'ZZZ9';
const PROBE_CATEGORIES = [27, 29, 31, 59];

const CANDIDATES = [
  'gra1', 'gra2',
  'mlg1', 'svq1', 'svq2',
  'mad1', 'mad2',
  'vlc1', 'vlc2',
  'bcn1', 'zgz1', 'alc1',
];

/** Conjunto de `id@precio` de las categorías sonda. Dos almacenes iguales lo tienen idéntico. */
async function fingerprint(warehouse: string | null): Promise<Set<string>> {
  const items = new Set<string>();
  for (const categoryId of PROBE_CATEGORIES) {
    const url = new URL(`${API_BASE}/categories/${categoryId}/`);
    url.searchParams.set('lang', 'es');
    if (warehouse) url.searchParams.set('wh', warehouse);

    const res = await httpGet(url.toString());
    if (res.status !== 200) {
      items.add(`${categoryId}:HTTP${res.status}`);
      continue;
    }
    const json = JSON.parse(res.body) as {
      categories?: { products?: { id: string; price_instructions?: { unit_price?: string } }[] }[];
    };
    for (const product of (json.categories ?? []).flatMap((c) => c.products ?? [])) {
      items.add(`${categoryId}/${product.id}@${product.price_instructions?.unit_price ?? '?'}`);
    }
  }
  return items;
}

/** Cuántas entradas hay en uno y no en el otro, en los dos sentidos. */
function differences(a: Set<string>, b: Set<string>): number {
  let diff = 0;
  for (const item of a) if (!b.has(item)) diff += 1;
  for (const item of b) if (!a.has(item)) diff += 1;
  return diff;
}

export async function runProbeWarehouse(): Promise<void> {
  log.step(`Sondeo de almacén para el CP ${POSTAL_CODE}`);

  const valid = await validatePostalCode();
  log.info(
    valid
      ? `El CP ${POSTAL_CODE} está dentro de la zona de reparto de Mercadona.`
      : `AVISO: Mercadona dice que el CP ${POSTAL_CODE} está fuera de su zona.`,
  );
  log.info(
    'Recordatorio: el endpoint change-pc valida el CP pero no revela el ' +
      'almacén. Por eso hay que sondear.',
  );

  log.info(`Huella de control con wh=${CONTROL_WAREHOUSE} (inválido a propósito)…`);
  const control = await fingerprint(CONTROL_WAREHOUSE);
  log.info(`Control: ${control.size} entradas en ${PROBE_CATEGORIES.length} categorías sonda.`);

  const distinct: string[] = [];
  for (const candidate of CANDIDATES) {
    const probe = await fingerprint(candidate);
    const diff = differences(probe, control);
    if (diff === 0) {
      log.info(`  wh=${candidate.padEnd(5)} → idéntico al control (o no existe)`);
      continue;
    }
    distinct.push(candidate);
    const pct = ((diff / Math.max(1, control.size)) * 100).toFixed(1);
    log.info(
      `  wh=${candidate.padEnd(5)} → ALMACÉN REAL · ${diff} entradas distintas del ` +
        `catálogo por defecto (${pct}% de la muestra)`,
    );
  }

  log.plain();
  if (distinct.length === 0) {
    log.info(
      'Ningún candidato devuelve un catálogo distinto del control. Deja ' +
        'WAREHOUSE = null en config.ts: el almacén por defecto sirve el mismo ' +
        'catálogo que cualquiera de ellos.',
    );
  } else {
    log.info(`Almacenes con catálogo propio: ${distinct.join(', ')}`);
    log.info(
      'La API no dice cuál corresponde al CP. Mira el porcentaje de diferencia ' +
        'de arriba: si es pequeño, no compensa volver a rastrear 4.300 fichas ' +
        '(~80 min) por cambiar de almacén. Si decides cambiarlo, pon el código ' +
        'en WAREHOUSE y anótalo en ARCHITECTURE.md.',
    );
  }
}
