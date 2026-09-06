/**
 * Almacenamiento persistente.
 *
 * Importa más de lo que parece en iPhone: Safari puede desalojar IndexedDB de
 * sitios que no se abren en un tiempo, y ahí es donde viven las recetas y los
 * favoritos. Las apps añadidas a la pantalla de inicio están exentas, pero
 * pedir persistencia explícitamente es la otra mitad del seguro. La primera
 * mitad es poder exportar los datos: ver db/backup.ts.
 */

export interface StorageState {
  /** El navegador ha marcado el almacenamiento como persistente. */
  persisted: boolean;
  /** El navegador no expone la API. */
  unsupported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function requestPersistence(): Promise<StorageState> {
  const storage = navigator.storage;
  if (!storage || typeof storage.persisted !== 'function') {
    return { persisted: false, unsupported: true, usageBytes: null, quotaBytes: null };
  }

  let persisted = false;
  try {
    persisted = await storage.persisted();
    // Pedirlo cuando ya lo está solo gasta una llamada.
    if (!persisted && typeof storage.persist === 'function') {
      persisted = await storage.persist();
    }
  } catch {
    persisted = false;
  }

  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (typeof storage.estimate === 'function') {
      const estimate = await storage.estimate();
      usageBytes = estimate.usage ?? null;
      quotaBytes = estimate.quota ?? null;
    }
  } catch {
    // La estimación es informativa; que falle no rompe nada.
  }

  return { persisted, unsupported: false, usageBytes, quotaBytes };
}

/** ¿Se está ejecutando como app instalada y no como pestaña del navegador? */
export function isInstalled(): boolean {
  const standaloneIos = (navigator as { standalone?: boolean }).standalone === true;
  return standaloneIos || window.matchMedia('(display-mode: standalone)').matches;
}

/** iOS necesita instrucciones distintas: no existe la invitación automática. */
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
