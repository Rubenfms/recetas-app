import type { StoredProduct } from '../db/catalog.js';

export type SortMode = 'relevancia' | 'precio' | 'referencia';

export const SORT_LABELS: { mode: SortMode; label: string }[] = [
  { mode: 'relevancia', label: 'Relevancia' },
  { mode: 'precio', label: 'Precio' },
  { mode: 'referencia', label: '€/kg' },
];

/**
 * El precio de referencia solo se puede comparar entre productos con el
 * mismo formato de referencia: 2 €/kg y 2 €/L no son lo mismo, y 2 €/ud
 * menos todavía. Se ordena por formato y dentro por precio, de modo que los
 * kg vayan juntos, los L juntos, etc.
 */
function referenceKey(product: StoredProduct): [string, number] {
  const fmt = (product.price.referenceFormat ?? '').toLowerCase().replace(/\s+/g, '');
  const ref = product.price.reference ?? Number.POSITIVE_INFINITY;
  return [fmt, ref];
}

export function sortProducts(products: StoredProduct[], mode: SortMode): StoredProduct[] {
  if (mode === 'relevancia') return products;
  const copy = [...products];
  if (mode === 'precio') {
    copy.sort(
      (a, b) =>
        (a.price.unit ?? Number.POSITIVE_INFINITY) - (b.price.unit ?? Number.POSITIVE_INFINITY),
    );
    return copy;
  }
  copy.sort((a, b) => {
    const [fa, ra] = referenceKey(a);
    const [fb, rb] = referenceKey(b);
    return fa.localeCompare(fb) || ra - rb;
  });
  return copy;
}

/**
 * Id del más barato por unidad de referencia, si hay comparación posible:
 * al menos dos productos con el mismo formato (kg, L…) y precio de
 * referencia. Se elige el formato más frecuente entre los resultados, que
 * es el que el usuario está comparando de verdad.
 */
export function cheapestByReference(products: StoredProduct[]): string | null {
  const byFormat = new Map<string, StoredProduct[]>();
  for (const p of products) {
    const [fmt] = referenceKey(p);
    if (!fmt || p.price.reference == null) continue;
    byFormat.set(fmt, [...(byFormat.get(fmt) ?? []), p]);
  }
  let best: StoredProduct[] | null = null;
  for (const group of byFormat.values()) {
    if (group.length >= 2 && (!best || group.length > best.length)) best = group;
  }
  if (!best) return null;
  const cheapest = best.reduce((a, b) =>
    (b.price.reference ?? Infinity) < (a.price.reference ?? Infinity) ? b : a,
  );
  return cheapest.id;
}
