import { useEffect, useState } from 'preact/hooks';

/**
 * Rutas por hash. Bajo GitHub Pages no hay servidor que reescriba URLs, así
 * que el fragmento es lo único que sobrevive a recargar en una ruta profunda.
 */
export type Route =
  | { name: 'buscar' }
  | { name: 'producto'; id: string }
  | { name: 'favoritos' }
  | { name: 'recetas' }
  | { name: 'ajustes' };

export type TabName = 'buscar' | 'favoritos' | 'recetas';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const producto = /^producto\/(.+)$/.exec(path);
  if (producto?.[1]) return { name: 'producto', id: decodeURIComponent(producto[1]) };
  if (path === 'favoritos') return { name: 'favoritos' };
  if (path === 'recetas') return { name: 'recetas' };
  if (path === 'ajustes') return { name: 'ajustes' };
  return { name: 'buscar' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'producto':
      return `#/producto/${encodeURIComponent(route.id)}`;
    case 'buscar':
      return '#/';
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  const next = hrefFor(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

/** Vuelve atrás si hay historial propio; si no, a la pestaña de origen. */
export function goBack(fallback: Route): void {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  navigate(fallback);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** Qué pestaña se ilumina para una ruta dada. */
export function tabOf(route: Route): TabName {
  switch (route.name) {
    case 'favoritos':
      return 'favoritos';
    case 'recetas':
      return 'recetas';
    default:
      // La ficha de producto y los ajustes se abren desde la búsqueda.
      return 'buscar';
  }
}
