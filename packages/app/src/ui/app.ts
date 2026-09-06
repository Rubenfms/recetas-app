import type { CatalogCategory } from '@recetas/shared';
import {
  getCategories,
  getDatasetSource,
  getLoadedDatasetStamp,
  getProduct,
  searchProducts,
  type StoredProduct,
} from '../db/catalog.js';
import { getNutritionOverride } from '../db/user.js';
import {
  describeFuente,
  describePackaging,
  escapeHtml,
  formatNetContent,
  formatPrice,
  formatReferencePrice,
  renderMarkedText,
} from './format.js';

const RESULT_LIMIT = 60;

let categoryNames = new Map<number, string>();

/**
 * Rutas por hash (`#/producto/4241`). Bajo GitHub Pages no hay servidor que
 * reescriba URLs, así que el hash es lo único que sobrevive a un recarga en
 * una ruta profunda.
 */
export async function mountApp(root: HTMLElement): Promise<void> {
  const categories = await getCategories();
  categoryNames = new Map(categories.map((c: CatalogCategory) => [c.id, c.name]));

  root.innerHTML = `
    <header class="top">
      <div class="top__row">
        <button class="top__back" id="back" hidden aria-label="Volver">←</button>
        <input id="q" class="search" type="search" placeholder="Buscar producto…"
               autocomplete="off" autocapitalize="off" spellcheck="false"
               enterkeyhint="search" aria-label="Buscar producto">
      </div>
    </header>
    <main id="view" class="view"></main>
    <footer class="foot" id="foot"></footer>
  `;

  const input = root.querySelector<HTMLInputElement>('#q');
  const back = root.querySelector<HTMLButtonElement>('#back');
  const view = root.querySelector<HTMLElement>('#view');
  const foot = root.querySelector<HTMLElement>('#foot');
  if (!input || !back || !view || !foot) return;

  await renderFooter(foot);

  let timer: number | undefined;
  const runSearch = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      // Escribir estando en una ficha vuelve al listado. Si no, la URL diría
      // que seguimos en la ficha mientras en pantalla hay resultados, y el
      // botón de volver del navegador no llevaría a donde parece.
      if (window.location.hash) {
        window.location.hash = '';
        return; // el hashchange encadena con route(), que pinta los resultados
      }
      void showResults(view, input.value);
    }, 120);
  };

  input.addEventListener('input', runSearch);
  back.addEventListener('click', () => {
    window.location.hash = '';
  });

  const route = async (): Promise<void> => {
    const match = /^#\/producto\/(.+)$/.exec(window.location.hash);
    if (match?.[1]) {
      back.hidden = false;
      await showProduct(view, decodeURIComponent(match[1]));
      window.scrollTo(0, 0);
      return;
    }
    back.hidden = true;
    await showResults(view, input.value);
  };

  window.addEventListener('hashchange', () => void route());
  await route();
  if (!window.location.hash) input.focus();
}

// ---------------------------------------------------------------- resultados

async function showResults(view: HTMLElement, query: string): Promise<void> {
  if (query.trim().length < 2) {
    view.innerHTML = `
      <p class="empty">Escribe al menos dos letras.<br>
      <span class="empty__hint">Funciona sin cobertura: el catálogo está en el móvil.</span></p>
    `;
    return;
  }

  const results = await searchProducts(query, { limit: RESULT_LIMIT });
  if (results.length === 0) {
    view.innerHTML = `<p class="empty">Nada para «${escapeHtml(query)}».</p>`;
    return;
  }

  view.innerHTML = `<ul class="list">${results.map(resultRow).join('')}</ul>${
    results.length === RESULT_LIMIT
      ? '<p class="empty__hint list__more">Hay más. Afina la búsqueda.</p>'
      : ''
  }`;
}

function resultRow(product: StoredProduct): string {
  const photo = product.photos[0]?.thumbnail;
  const reference = formatReferencePrice(product);
  return `
    <li class="row">
      <a class="row__link" href="#/producto/${encodeURIComponent(product.id)}">
        ${
          photo
            ? `<img class="row__img" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" width="56" height="56">`
            : '<div class="row__img row__img--none" aria-hidden="true"></div>'
        }
        <span class="row__body">
          <span class="row__name">${escapeHtml(product.name)}</span>
          <span class="row__meta">${escapeHtml(describePackaging(product) || '—')}</span>
        </span>
        <span class="row__price">
          <span class="row__price-main">${formatPrice(product.price.unit)}</span>
          ${reference ? `<span class="row__price-ref">${escapeHtml(reference)}</span>` : ''}
        </span>
      </a>
    </li>
  `;
}

// ---------------------------------------------------------------- ficha

async function showProduct(view: HTMLElement, id: string): Promise<void> {
  const product = await getProduct(id);
  if (!product) {
    view.innerHTML = `<p class="empty">Ese producto no está en el catálogo descargado.</p>`;
    return;
  }

  // `manual` gana sobre lo que traiga el catálogo: es un dato mío.
  const override = await getNutritionOverride(product.id);
  const photo = product.photos[0]?.regular;
  const path = product.categoryPath
    .map((catId) => categoryNames.get(catId))
    .filter((name): name is string => Boolean(name));

  view.innerHTML = `
    <article class="detail">
      ${
        photo
          ? `<img class="detail__img" src="${escapeHtml(photo)}" alt="${escapeHtml(product.name)}" decoding="async">`
          : ''
      }
      <h1 class="detail__name">${escapeHtml(product.name)}</h1>
      ${product.brand ? `<p class="detail__brand">${escapeHtml(product.brand)}</p>` : ''}

      <div class="detail__price">
        <span class="detail__price-main">${formatPrice(product.price.unit)}</span>
        ${
          formatReferencePrice(product)
            ? `<span class="detail__price-ref">${escapeHtml(formatReferencePrice(product))}</span>`
            : ''
        }
      </div>

      <dl class="facts">
        ${fact('Formato', describePackaging(product) || '—')}
        ${fact('Contenido', formatNetContent(product.netContent))}
        ${fact('EAN', product.ean ?? 'sin EAN')}
        ${fact('Id Mercadona', product.id)}
        ${product.origin ? fact('Origen', product.origin) : ''}
        ${path.length > 0 ? fact('Categoría', path.join(' › ')) : ''}
      </dl>

      ${renderNutrition(product, override)}

      ${
        product.ingredients
          ? `<section class="block"><h2 class="block__title">Ingredientes</h2>
             <p class="block__text">${renderMarkedText(product.ingredients)}</p></section>`
          : ''
      }
      ${
        product.allergens
          ? `<section class="block"><h2 class="block__title">Alérgenos</h2>
             <p class="block__text">${renderMarkedText(product.allergens)}</p></section>`
          : ''
      }
    </article>
  `;
}

function fact(label: string, value: string): string {
  return `<div class="facts__item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/**
 * RESTRICCIÓN DURA: se enseña siempre de dónde salen los macros. Cuando no hay
 * datos también se dice por qué, para no dejar la duda de si es un fallo.
 */
function renderNutrition(
  product: StoredProduct,
  override: { fuente: 'manual' } | undefined,
): string {
  const nutrition = product.nutrition;

  if (!nutrition && !override) {
    return `
      <section class="block block--nutrition">
        <h2 class="block__title">Valores nutricionales</h2>
        <p class="nutrition__none">Sin datos.</p>
        <p class="nutrition__why">La API de Mercadona no publica kcal ni macros:
        solo ingredientes y alérgenos. Se rellenarán cruzando el EAN con Open
        Food Facts.</p>
        <p class="fuente fuente--none">fuente: —</p>
      </section>
    `;
  }

  const fuente = override ? 'manual' : (nutrition?.fuente ?? 'generico');
  const per = nutrition?.per ?? '100g';
  const rows: [string, number | null | undefined, string][] = [
    ['Energía', nutrition?.kcal, 'kcal'],
    ['Proteínas', nutrition?.protein_g, 'g'],
    ['Hidratos', nutrition?.carbs_g, 'g'],
    ['  de los cuales azúcares', nutrition?.sugars_g, 'g'],
    ['Grasas', nutrition?.fat_g, 'g'],
    ['  de las cuales saturadas', nutrition?.saturates_g, 'g'],
    ['Fibra', nutrition?.fiber_g, 'g'],
    ['Sal', nutrition?.salt_g, 'g'],
  ];

  return `
    <section class="block block--nutrition">
      <h2 class="block__title">Valores nutricionales <small>por ${per === '100g' ? '100 g' : '100 ml'}</small></h2>
      <table class="nutrition">
        <tbody>
          ${rows
            .map(
              ([label, value, unit]) =>
                `<tr><th>${escapeHtml(label.trim())}</th><td>${
                  value == null ? '—' : `${value} ${unit}`
                }</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p class="fuente">fuente: <strong>${escapeHtml(fuente)}</strong> · ${escapeHtml(
        describeFuente(fuente),
      )}</p>
    </section>
  `;
}

// ---------------------------------------------------------------- pie

async function renderFooter(foot: HTMLElement): Promise<void> {
  const [stamp, source] = await Promise.all([getLoadedDatasetStamp(), getDatasetSource()]);
  const date = stamp ? new Date(stamp).toLocaleDateString('es-ES') : '—';
  const postalCode = typeof source?.['postalCode'] === 'string' ? source['postalCode'] : '—';
  foot.innerHTML = `
    <p>Catálogo del ${escapeHtml(date)} · CP ${escapeHtml(postalCode)}</p>
    <p class="foot__note">Las fotos se guardan según las vas mirando.</p>
  `;
}
