import { z } from 'zod';
import { userDb } from './user.js';

/**
 * Copia de seguridad de MIS datos.
 *
 * No es un extra. Recetas, favoritos y correcciones viven solo en IndexedDB, y
 * en iOS Safari puede desalojar el almacenamiento de sitios que no se abren en
 * un tiempo. Poder sacar un fichero y volver a meterlo es lo que convierte eso
 * en una molestia en vez de en una pérdida.
 *
 * El catálogo NO se exporta: se vuelve a bajar solo desde dataset.json.
 */

export const BACKUP_FORMAT = 1;

const TABLES = ['recipes', 'favorites', 'logEntries', 'nutritionOverrides'] as const;
type TableName = (typeof TABLES)[number];

const BackupSchema = z.object({
  app: z.literal('recetas-app'),
  format: z.number(),
  exportedAt: z.string(),
  tables: z.record(z.array(z.unknown())),
});
export type BackupFile = z.infer<typeof BackupSchema>;

// ---------------------------------------------------------------------------
// Blobs
//
// Las fotos de receta serán Blobs y JSON no sabe guardarlos. Se codifican con
// una marca para poder reconstruirlos al importar. Está aquí desde ya para que
// la primera copia hecha con fotos no se quede a medias sin avisar.
// ---------------------------------------------------------------------------

interface EncodedBlob {
  __blob: true;
  type: string;
  base64: string;
}

function isEncodedBlob(value: unknown): value is EncodedBlob {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __blob?: unknown }).__blob === true &&
    typeof (value as EncodedBlob).base64 === 'string'
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // En trozos: un spread de un array de megabytes revienta la pila.
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return { __blob: true, type: value.type, base64: await blobToBase64(value) } as EncodedBlob;
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = await encode(inner);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (isEncodedBlob(value)) return base64ToBlob(value.base64, value.type);
  if (Array.isArray(value)) return value.map(decode);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = decode(inner);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Exportar
// ---------------------------------------------------------------------------

export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    const rows = await userDb.table(name).toArray();
    tables[name] = (await encode(rows)) as unknown[];
  }
  return {
    app: 'recetas-app',
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function backupFilename(date = new Date()): string {
  return `recetas-copia-${date.toISOString().slice(0, 10)}.json`;
}

export type ExportResult = 'shared' | 'downloaded';

/**
 * En iPhone la hoja de compartir es lo que permite guardar en Archivos o
 * mandárselo a otro sitio; el enlace de descarga es el plan B.
 */
export async function exportBackup(): Promise<ExportResult> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const filename = backupFilename();
  const file = new File([json], filename, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] }) && typeof navigator.share === 'function') {
    try {
      await navigator.share({ files: [file], title: 'Copia de mis recetas' });
      return 'shared';
    } catch (err) {
      // Cancelar la hoja lanza AbortError: no es un fallo, pero tampoco hay
      // que caer a la descarga, porque el usuario ha dicho que no.
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Cualquier otro fallo sí merece el plan B.
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

export interface BackupSummary {
  exportedAt: string;
  counts: Record<string, number>;
}

export function readBackup(text: string): { backup: BackupFile; summary: BackupSummary } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Ese fichero no es JSON.');
  }

  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('Ese fichero no es una copia de recetas-app.');
  }
  if (parsed.data.format > BACKUP_FORMAT) {
    throw new Error(
      `La copia es de un formato más nuevo (${parsed.data.format}) que esta versión de la app.`,
    );
  }

  const counts: Record<string, number> = {};
  for (const name of TABLES) counts[name] = parsed.data.tables[name]?.length ?? 0;

  return { backup: parsed.data, summary: { exportedAt: parsed.data.exportedAt, counts } };
}

/**
 * Reemplaza mis datos por los de la copia, en una sola transacción: o entra
 * todo o no entra nada. Es destructivo a propósito y quien llama tiene que
 * haberlo confirmado antes.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await userDb.transaction(
    'rw',
    userDb.recipes,
    userDb.favorites,
    userDb.logEntries,
    userDb.nutritionOverrides,
    async () => {
      for (const name of TABLES) {
        const table = userDb.table(name as TableName);
        await table.clear();
        const rows = backup.tables[name];
        if (rows && rows.length > 0) {
          await table.bulkAdd(decode(rows) as unknown[]);
        }
      }
    },
  );
}
