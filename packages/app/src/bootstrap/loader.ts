import { DatasetSchema, type Dataset } from '@recetas/shared';
import { countProducts, getLoadedDatasetStamp, replaceCatalog } from '../db/catalog.js';

/**
 * Carga del dataset en IndexedDB.
 *
 * Primer arranque: se descarga con pantalla de progreso. A partir de ahí la
 * app arranca desde IndexedDB y el dataset solo se vuelve a mirar para ver si
 * hay una versión nueva.
 *
 * Este módulo NO importa `db/user.ts`. Es deliberado: el cargador del catálogo
 * no tiene por qué poder tocar mis datos.
 */

/** Sale de `base` en vite.config.ts. No escribas la ruta a mano. */
const DATASET_URL = `${import.meta.env.BASE_URL}data/dataset.json`;

export type LoadPhase =
  | { phase: 'checking' }
  | { phase: 'downloading'; received: number; total: number | null }
  | { phase: 'parsing' }
  | { phase: 'storing'; inserted: number; total: number }
  | { phase: 'done'; products: number }
  | { phase: 'error'; message: string };

export type ProgressListener = (state: LoadPhase) => void;

async function downloadDataset(onProgress: ProgressListener): Promise<Dataset> {
  const response = await fetch(DATASET_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`El dataset respondió HTTP ${response.status} en ${DATASET_URL}`);
  }

  const declared = response.headers.get('content-length');
  const total = declared ? Number(declared) : null;

  // Se lee en streaming para poder enseñar cuánto lleva: son ~2 MB y con mala
  // cobertura la diferencia entre una barra y una pantalla parada es notable.
  let text: string;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress({ phase: 'downloading', received, total });
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    text = new TextDecoder().decode(merged);
  } else {
    text = await response.text();
  }

  onProgress({ phase: 'parsing' });

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('El dataset no es JSON válido. ¿Se ha subido a medias?');
  }

  // El pipeline ya lo validó al generarlo, pero un fichero servido por la web
  // puede estar cacheado, truncado o ser de otra versión del esquema.
  const parsed = DatasetSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `El dataset no cumple el esquema esperado` +
        (first ? ` (${first.path.join('.') || 'raíz'}: ${first.message})` : '') +
        '. Regenera dataset.json con el pipeline.',
    );
  }

  return parsed.data;
}

async function install(dataset: Dataset, onProgress: ProgressListener): Promise<void> {
  onProgress({ phase: 'storing', inserted: 0, total: dataset.products.length });
  await replaceCatalog(
    dataset.products,
    dataset.categories,
    {
      generatedAt: dataset.generatedAt,
      schemaVersion: dataset.schemaVersion,
      source: dataset.source,
    },
    (inserted, total) => onProgress({ phase: 'storing', inserted, total }),
  );
  onProgress({ phase: 'done', products: dataset.products.length });
}

/**
 * Deja el catálogo listo. Devuelve `true` si ha tenido que descargarlo.
 * Si ya hay catálogo, no toca la red: la app arranca desde IndexedDB.
 */
export async function ensureCatalog(onProgress: ProgressListener): Promise<boolean> {
  onProgress({ phase: 'checking' });

  const existing = await countProducts();
  if (existing > 0) {
    onProgress({ phase: 'done', products: existing });
    return false;
  }

  const dataset = await downloadDataset(onProgress);
  await install(dataset, onProgress);
  return true;
}

/**
 * Busca una versión nueva del dataset en segundo plano. Se llama después de
 * pintar la app, así que puede fallar sin consecuencias: sin cobertura, la
 * app sigue funcionando con lo que ya tiene.
 */
export async function checkForUpdate(
  onProgress: ProgressListener,
): Promise<'updated' | 'up-to-date' | 'offline'> {
  const loaded = await getLoadedDatasetStamp();

  try {
    const dataset = await downloadDataset(() => {
      /* silencioso: esto pasa de fondo y no debe robar la pantalla */
    });
    if (dataset.generatedAt === loaded) return 'up-to-date';
    await install(dataset, onProgress);
    return 'updated';
  } catch (err) {
    // Sin cobertura es lo normal y no hay nada que decir. Pero si el fallo es
    // otro (un dataset corrupto, un esquema que ya no encaja) conviene poder
    // verlo en la consola en vez de que desaparezca sin más.
    if (navigator.onLine) {
      console.warn('No se pudo comprobar si hay un catálogo nuevo:', err);
    }
    return 'offline';
  }
}
