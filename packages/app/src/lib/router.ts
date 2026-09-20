import { useEffect, useState } from 'preact/hooks';

/**
 * Rutas por hash. Bajo GitHub Pages no hay servidor que reescriba URLs, así
 * que el fragmento es lo único que sobrevive a recargar en una ruta profunda.
 */
export type Route =
  | { name: 'buscar' }
  | { name: 'producto'; id: string }
  | { name: 'categoria'; id: number }
  | { name: 'favoritos' }
  | { name: 'recetas' }
  | { name: 'receta'; id: string }
  /** `id` nulo = receta nueva. */
  | { name: 'receta-editar'; id: string | null; productId?: string }
  | { name: 'ajustes' };

export type TabName = 'buscar' | 'favoritos' | 'recetas';

export function parseRoute(hash: string): Route {
  // `#/receta/nueva?producto=123`: el producto con el que arranca el editor
  // cuando vienes de "A una receta" en una ficha.
  const [rawPath, queryString] = hash.replace(/^#\/?/, '').split('?');
  const path = rawPath ?? '';
  const productId = new URLSearchParams(queryString ?? '').get('producto') ?? undefined;

  const producto = /^producto\/(.+)$/.exec(path);
  if (producto?.[1]) return { name: 'producto', id: decodeURIComponent(producto[1]) };

  const categoria = /^categoria\/(\d+)$/.exec(path);
  if (categoria?.[1]) return { name: 'categoria', id: Number(categoria[1]) };

  if (path === 'favoritos') return { name: 'favoritos' };
  if (path === 'recetas') return { name: 'recetas' };
  if (path === 'receta/nueva') return { name: 'receta-editar', id: null, productId };

  const editar = /^receta\/(.+)\/editar$/.exec(path);
  if (editar?.[1]) return { name: 'receta-editar', id: decodeURIComponent(editar[1]), productId };

  const receta = /^receta\/(.+)$/.exec(path);
  if (receta?.[1]) return { name: 'receta', id: decodeURIComponent(receta[1]) };

  if (path === 'ajustes') return { name: 'ajustes' };
  return { name: 'buscar' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'producto':
      return `#/producto/${encodeURIComponent(route.id)}`;
    case 'categoria':
      return `#/categoria/${route.id}`;
    case 'receta':
      return `#/receta/${encodeURIComponent(route.id)}`;
    case 'receta-editar': {
      const base = route.id === null ? '#/receta/nueva' : `#/receta/${encodeURIComponent(route.id)}/editar`;
      return route.productId ? `${base}?producto=${encodeURIComponent(route.productId)}` : base;
    }
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

/** Sustituye la entrada actual del historial: para "guardar" → ficha, sin que atrás vuelva al editor. */
export function replace(route: Route): void {
  window.history.replaceState(null, '', hrefFor(route));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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
    case 'receta':
    case 'receta-editar':
      return 'recetas';
    default:
      // Ficha de producto, categorías y ajustes se abren desde la búsqueda.
      return 'buscar';
  }
}
