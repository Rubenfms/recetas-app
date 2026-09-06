import { IconBook } from './icons.js';

/**
 * Hueco a propósito. Las recetas son la fase 4 del plan; la pestaña existe ya
 * porque la navegación se decidió entera de una vez, y una pestaña que no dice
 * nada es peor que una que explica cuándo llega.
 */
export function RecipesView() {
  return (
    <div class="page">
      <div class="page__head">
        <h1 class="page__title serif">Recetas</h1>
      </div>
      <div class="empty">
        <span style={{ display: 'inline-flex', color: 'var(--muted)' }}>
          <IconBook size={34} />
        </span>
        <p style={{ margin: '14px 0 0' }}>Todavía no.</p>
        <p class="empty__hint" style={{ margin: '6px 0 0' }}>
          Primero los macros de Open Food Facts, para que una receta pueda decirte
          las kcal por ración además del coste.
        </p>
      </div>
    </div>
  );
}
