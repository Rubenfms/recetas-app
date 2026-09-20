import { useEffect, useState } from 'preact/hooks';
import type { CatalogCategory } from '@recetas/shared';
import {
  getCategory,
  getChildCategories,
  getProductsInCategory,
  type StoredProduct,
} from '../db/catalog.js';
import { goBack, hrefFor } from '../lib/router.js';
import { IconBack } from './icons.js';
import { ProductList } from './ProductList.js';

/**
 * Una categoría: sus hijas como chips y todo lo que cuelga de ella como
 * lista. En una de nivel 0 son cientos de productos, y está bien: en el
 * súper se navega por pasillo, y ordenar por €/kg dentro de "Yogures" es
 * justo la comparación que uno quiere hacer delante del lineal.
 */
export function CategoryView({ id }: { id: number }) {
  const [category, setCategory] = useState<CatalogCategory | null | undefined>(undefined);
  const [parent, setParent] = useState<CatalogCategory | null>(null);
  const [children, setChildren] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<StoredProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cat = await getCategory(id);
      if (cancelled) return;
      setCategory(cat ?? null);
      if (!cat) return;
      const [kids, rows, up] = await Promise.all([
        getChildCategories(id),
        getProductsInCategory(id),
        cat.parentId === null ? Promise.resolve(undefined) : getCategory(cat.parentId),
      ]);
      if (cancelled) return;
      setChildren(kids);
      setProducts(rows);
      setParent(up ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (category === undefined) return <div class="empty">Cargando…</div>;
  if (category === null) return <p class="empty">Esa categoría no está en el catálogo.</p>;

  return (
    <div class="page">
      <div class="detail__bar">
        <button
          class="iconbtn"
          type="button"
          aria-label="Volver"
          onClick={() => goBack(parent ? { name: 'categoria', id: parent.id } : { name: 'buscar' })}
        >
          <IconBack />
        </button>
      </div>

      <div class="page__pad">
        {parent && (
          <a href={hrefFor({ name: 'categoria', id: parent.id })} class="eyebrow" style={{ display: 'block' }}>
            {parent.name}
          </a>
        )}
        <h1 class="page__title serif" style={{ fontSize: '26px', marginTop: parent ? '4px' : 0 }}>
          {category.name}
        </h1>
        <p class="page__sub">{products.length} productos</p>

        {children.length > 0 && (
          <div class="chips" style={{ margin: '14px 0 6px' }}>
            {children.map((c) => (
              <a key={c.id} class="chip" href={hrefFor({ name: 'categoria', id: c.id })}>
                {c.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <ProductList products={products} emptyText="No hay productos aquí." />
    </div>
  );
}
