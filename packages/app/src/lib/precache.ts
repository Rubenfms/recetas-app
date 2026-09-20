/**
 * Descarga las fotos de unos productos para que el service worker las guarde.
 *
 * La promesa de "funciona sin cobertura" solo se cumple para lo que el SW ha
 * visto pasar. Al guardar una receta, sus fotos se piden a propósito: así en
 * el supermercado la receta se ve entera aunque nunca hayas abierto esas
 * fichas. El CDN manda CORS, así que son peticiones normales que Workbox
 * atrapa con su regla CacheFirst.
 */
import type { StoredProduct } from '../db/catalog.js';

export async function precachePhotos(products: (StoredProduct | undefined)[]): Promise<void> {
  const urls = new Set<string>();
  for (const product of products) {
    const photo = product?.photos[0];
    if (!photo) continue;
    urls.add(photo.thumbnail);
    urls.add(photo.regular);
  }
  if (urls.size === 0) return;
  // Fallar aquí no es grave: la foto se cacheará la primera vez que se vea.
  await Promise.allSettled([...urls].map((url) => fetch(url, { mode: 'cors' })));
}
