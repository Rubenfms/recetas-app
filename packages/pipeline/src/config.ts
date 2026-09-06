import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz de packages/pipeline. */
export const PACKAGE_ROOT = resolve(here, '..');
/** Raíz del monorepo. */
export const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

/** Todo lo de aquí dentro está en .gitignore. Volcados crudos y caché. */
export const DATA_DIR = resolve(PACKAGE_ROOT, 'data');
export const RAW_DIR = resolve(DATA_DIR, 'raw');
export const CACHE_DIR = resolve(DATA_DIR, 'cache');

/** El único punto de contacto con la PWA. Esto sí se commitea. */
export const DATASET_PATH = resolve(
  REPO_ROOT,
  'packages',
  'app',
  'public',
  'data',
  'dataset.json',
);

export const API_BASE = 'https://tienda.mercadona.es/api';

/**
 * RESTRICCIÓN DURA: el catálogo depende del código postal.
 * Granada capital.
 */
export const POSTAL_CODE = '18014';

/**
 * Código de almacén (`?wh=`). `null` deja el almacén por defecto de la API,
 * que está verificado que es `vlc1`: el bundle de tienda.mercadona.es define
 * una única constante de almacén (`{VLC1: "vlc1"}`) y la usa siempre. O sea,
 * el catálogo que ve cualquiera en la web —también desde Granada— es este.
 *
 * Otros almacenes existen y devuelven precios distintos en fresco (mad1
 * cambia 33 de 53 precios de fruta), pero la web nunca los usa y no hay forma
 * de saber cuál corresponde a un CP. `gra1` y `gra2` no existen: un `wh`
 * inválido no da error, se ignora en silencio y cae al de por defecto.
 *
 * Si lo cambias, la caché queda invalidada —la URL forma parte de la clave— y
 * toca volver a rastrear las 4.300 fichas. Ver ARCHITECTURE.md § "Código
 * postal y almacén" y `npm run pipeline:probe-warehouse`.
 */
export const WAREHOUSE: string | null = null;

/** RESTRICCIÓN DURA: máximo 1 petición/segundo. El margen es deliberado. */
export const REQUEST_INTERVAL_MS = 1100;

export const MAX_RETRIES = 5;
export const RETRY_BASE_DELAY_MS = 2000;
/** Akamai bloqueando: hay que esperar de verdad, no reintentar deprisa. */
export const BLOCKED_RETRY_DELAY_MS = 60_000;

/**
 * Cuántos productos pueden fallar la validación de Zod antes de abortar.
 * Uno suelto es un producto raro; muchos significan que la API ha cambiado y
 * hay que enterarse a gritos, no seguir generando un dataset a medias.
 */
export const MAX_INVALID_PRODUCT_RATIO = 0.01;

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
