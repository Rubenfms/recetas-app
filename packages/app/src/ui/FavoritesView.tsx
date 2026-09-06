import { useEffect, useState } from 'preact/hooks';
import { getProduct, type StoredProduct } from '../db/catalog.js';
import { listFavorites } from '../db/user.js';
import { formatPrice } from '../lib/format.js';
import { FavoriteButton } from './FavoriteButton.js';
import { ProductRow } from './ProductRow.js';

export function FavoritesView() {
  const [products, setProducts] = useState<StoredProduct[] | null>(null);
  /** Ids que estaban guardados pero ya no existen en el catálogo actual. */
  const [missing, setMissing] = useState(0);

  const load = async (): Promise<void> => {
    const rows = await listFavorites();
    const loaded = await Promise.all(rows.map((f) => getProduct(f.productId)));
    setProducts(loaded.filter((p): p is StoredProduct => Boolean(p)));
    setMissing(loaded.filter((p) => !p).length);
  };

  useEffect(() => {
    void load();
  }, []);

  if (products === null) return <div class="empty">Cargando…</div>;

  const total = products.reduce((sum, p) => sum + (p.price.unit ?? 0), 0);

  return (
    <div class="page">
      <div class="page__head">
        <h1 class="page__title serif">Favoritos</h1>
        <p class="page__sub">
          {products.length === 0
            ? 'Todavía no has guardado nada'
            : `${products.length} ${products.length === 1 ? 'producto' : 'productos'} · ${formatPrice(total)} si te los llevas todos`}
        </p>
      </div>

      {missing > 0 && (
        <p class="notice notice--warn">
          {missing} {missing === 1 ? 'producto guardado ya no está' : 'productos guardados ya no están'} en
          el catálogo. Mercadona los habrá retirado.
        </p>
      )}

      {products.length === 0 ? (
        <p class="empty">
          Guarda un producto con el corazón de su ficha y aparecerá aquí.
          <br />
          <span class="empty__hint">Se queda en el móvil; no se sube a ningún sitio.</span>
        </p>
      ) : (
        <ul class="rows">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              trailing={
                <FavoriteButton product={product} saved onToggled={() => void load()} />
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
