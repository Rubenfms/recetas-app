import { useEffect, useState } from 'preact/hooks';
import { listRecipes, type Recipe } from '../db/user.js';
import { hrefFor } from '../lib/router.js';
import { IconClose, IconPlus } from './icons.js';

/**
 * Hoja para "A una receta" desde la ficha de un producto: elige una receta
 * existente o crea una nueva, y el editor se abre con el producto ya puesto.
 */
export function RecipePicker({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    void listRecipes().then(setRecipes);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Añadir a una receta">
      <button class="sheet__backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <div class="sheet__panel">
        <div class="sheet__head">
          <span class="sheet__title">Añadir a una receta</span>
          <button class="iconbtn" type="button" aria-label="Cerrar" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>

        <a class="sheet__row sheet__row--new" href={hrefFor({ name: 'receta-editar', id: null, productId })}>
          <span class="sheet__plus">
            <IconPlus size={18} />
          </span>
          Nueva receta
        </a>

        {recipes === null ? (
          <p class="empty__hint" style={{ padding: '12px 0', color: 'var(--muted)' }}>
            Cargando…
          </p>
        ) : recipes.length === 0 ? (
          <p class="empty__hint" style={{ padding: '12px 0', color: 'var(--muted)' }}>
            Todavía no tienes recetas.
          </p>
        ) : (
          <ul class="rows rows--compact" style={{ marginTop: '4px' }}>
            {recipes.map((r) => (
              <li key={r.id} class="row">
                <a class="row__link" href={hrefFor({ name: 'receta-editar', id: r.id, productId })}>
                  <span class="row__body">
                    <span class="row__name">{r.name || 'Sin nombre'}</span>
                    <span class="row__meta">
                      {r.ingredients.length} {r.ingredients.length === 1 ? 'ingrediente' : 'ingredientes'}
                      {r.ingredients.some((i) => i.productId === productId) && ' · ya lo lleva'}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
