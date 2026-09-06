import type { CatalogProduct, Photo } from '@recetas/shared';
import type { CategoryRef, ProductDetail } from '../mercadona/schemas.js';
import { toNetContent, toNumber } from './size.js';

/**
 * Ruta de categorías de nivel 0 hacia dentro, a partir del árbol anidado que
 * trae la ficha. Si la ficha no la trae, se usa la ruta por la que
 * encontramos el producto durante el crawl.
 */
export function categoryPathOf(
  refs: readonly CategoryRef[] | undefined,
  fallback: readonly number[],
): number[] {
  const first = refs?.[0];
  if (!first) return [...fallback];

  const path: number[] = [];
  let node: CategoryRef | undefined = first;
  while (node) {
    path.push(node.id);
    node = node.categories?.[0];
  }
  return path;
}

function normalizePhotos(product: ProductDetail): Photo[] {
  const photos = product.photos ?? [];
  const out: Photo[] = [];

  for (const photo of photos) {
    // Sin `regular` no hay nada que enseñar; se descarta la entrada.
    const regular = photo.regular ?? photo.zoom ?? photo.thumbnail;
    if (!regular) continue;
    out.push({
      thumbnail: photo.thumbnail ?? regular,
      regular,
      zoom: photo.zoom ?? regular,
      perspective: photo.perspective ?? null,
    });
  }

  // Algunas fichas no traen `photos` pero sí `thumbnail` suelto.
  if (out.length === 0 && product.thumbnail) {
    out.push({
      thumbnail: product.thumbnail,
      regular: product.thumbnail,
      zoom: product.thumbnail,
      perspective: null,
    });
  }

  return out;
}

/**
 * Ficha de Mercadona → producto de catálogo.
 *
 * `nutrition` sale siempre `null`: la API no publica valores nutricionales.
 * El hueco existe para el cruce con Open Food Facts y para los genéricos, que
 * rellenarán el objeto con su `fuente` correspondiente.
 */
export function normalizeProduct(
  product: ProductDetail,
  discoveryPath: readonly number[],
): CatalogProduct {
  const pi = product.price_instructions;
  const id = product.id;
  const categoryPath = categoryPathOf(product.categories, discoveryPath);

  const ean = product.ean?.trim();
  const brand = (product.brand ?? product.details?.brand)?.trim();
  const origin = (product.origin ?? product.details?.origin)?.trim();

  return {
    id,
    ean: ean ? ean : null,
    slug: product.slug,
    name: product.display_name,
    brand: brand ? brand : null,
    origin: origin ? origin : null,
    packaging: product.packaging?.trim() || null,

    categoryPath,

    netContent: toNetContent(pi),
    rawSize: {
      unitSize: pi.unit_size ?? null,
      sizeFormat: pi.size_format ?? null,
      totalUnits: pi.total_units ?? null,
      packSize: pi.pack_size ?? null,
      unitName: pi.unit_name ?? null,
      drainedWeight: pi.drained_weight ?? null,
      approxSize: pi.approx_size ?? false,
      isPack: pi.is_pack ?? false,
      isBulk: product.is_bulk ?? false,
      isVariableWeight: product.is_variable_weight ?? false,
      sellingMethod: pi.selling_method ?? null,
    },
    price: {
      unit: toNumber(pi.unit_price, 'unit_price', id),
      reference: toNumber(pi.reference_price, 'reference_price', id),
      referenceFormat: pi.reference_format ?? null,
      previousUnit: toNumber(pi.previous_unit_price, 'previous_unit_price', id),
      taxPercentage: toNumber(pi.tax_percentage, 'tax_percentage', id),
    },
    photos: normalizePhotos(product),

    ingredients: product.nutrition_information?.ingredients?.trim() || null,
    allergens: product.nutrition_information?.allergens?.trim() || null,

    nutrition: null,
  };
}
