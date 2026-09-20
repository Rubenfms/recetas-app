import { useCallback, useEffect, useState } from 'preact/hooks';
import type { StoredProduct } from '../db/catalog.js';
import { listFavorites } from '../db/user.js';
import { SORT_LABELS, cheapestByReference, sortProducts, type SortMode } from '../lib/sorting.js';
import { FavoriteButton } from './FavoriteButton.js';
import { ProductRow } from './ProductRow.js';

/**
 * Lista de productos con orden, "el más barato" y corazón por fila. La usan
 * la búsqueda y la vista de categoría; el estado de favoritos vive aquí para
 * que las dos se comporten igual.
 */
export function ProductList({
  products,
  onFavoritesChanged,
  sortable = true,
  emptyText,
}: {
  products: StoredProduct[];
  onFavoritesChanged?: () => void;
  sortable?: boolean;
  emptyText?: string;
}) {
  const [mode, setMode] = useState<SortMode>('relevancia');
  const [favIds, setFavIds] = useState<ReadonlySet<string>>(() => new Set());

  const loadFavorites = useCallback(async () => {
    const rows = await listFavorites();
    setFavIds(new Set(rows.map((r) => r.productId)));
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  if (products.length === 0) {
    return emptyText ? <p class="empty">{emptyText}</p> : null;
  }

  const sorted = sortProducts(products, mode);
  const cheapest = cheapestByReference(products);

  return (
    <>
      {sortable && (
        <div class="chips chips--row" role="group" aria-label="Ordenar">
          {SORT_LABELS.map((s) => (
            <button
              key={s.mode}
              type="button"
              class={mode === s.mode ? 'chip chip--on chip--sm' : 'chip chip--sm'}
              aria-pressed={mode === s.mode}
              onClick={() => setMode(s.mode)}
            >
              {s.label}
            </button>
          ))}
          <span class="chips__count num">{products.length}</span>
        </div>
      )}
      <ul class="rows">
        {sorted.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            badge={product.id === cheapest ? 'el más barato por unidad' : undefined}
            trailing={
              <FavoriteButton
                product={product}
                saved={favIds.has(product.id)}
                onToggled={(saved) => {
                  setFavIds((prev) => {
                    const next = new Set(prev);
                    if (saved) next.add(product.id);
                    else next.delete(product.id);
                    return next;
                  });
                  onFavoritesChanged?.();
                }}
              />
            }
          />
        ))}
      </ul>
    </>
  );
}
