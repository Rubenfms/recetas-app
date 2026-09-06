/**
 * Esquemas Zod de las respuestas de la API interna de tienda.mercadona.es.
 *
 * RESTRICCIÓN DURA: toda respuesta de la API externa se valida aquí. Si algo
 * no encaja, `api.ts` falla con un mensaje que dice qué campo, qué se esperaba
 * y qué llegó. Nunca en silencio.
 *
 * Criterio: los campos que usamos son obligatorios; los que solo guardamos van
 * `.optional()`/`.nullable()`. Zod descarta las claves desconocidas, así que si
 * Mercadona añade un campo nuevo no rompemos nada — pero `api.ts` cuenta las
 * claves nuevas y las saca en el informe para que nos enteremos.
 *
 * Los números que llegan como string (todos los precios) NO se convierten
 * aquí: se validan como string|number y los convierte `normalize/`, que puede
 * dar un error con el id del producto delante.
 */
import { z } from 'zod';

/** Precios: `"3.45"`, `"3.450"`, e incluso `"       17.75"` con padding. */
const MoneyLike = z.union([z.string(), z.number()]).nullable().optional();

/** El id de producto llega como string, pero no me fío de que siempre. */
const IdAsString = z.union([z.string(), z.number()]).transform(String);

// ---------------------------------------------------------------------------
// price_instructions
// ---------------------------------------------------------------------------

export const PriceInstructionsSchema = z.object({
  unit_size: z.number().nullable().optional(),
  size_format: z.string().nullable().optional(),
  unit_price: MoneyLike,
  bulk_price: MoneyLike,
  reference_price: MoneyLike,
  reference_format: z.string().nullable().optional(),
  previous_unit_price: MoneyLike,
  tax_percentage: MoneyLike,
  total_units: z.number().nullable().optional(),
  pack_size: z.number().nullable().optional(),
  unit_name: z.string().nullable().optional(),
  drained_weight: z.number().nullable().optional(),
  selling_method: z.number().nullable().optional(),
  approx_size: z.boolean().nullable().optional(),
  is_pack: z.boolean().nullable().optional(),
  is_new: z.boolean().nullable().optional(),
  price_decreased: z.boolean().nullable().optional(),
  iva: z.number().nullable().optional(),
  unit_selector: z.boolean().nullable().optional(),
  bunch_selector: z.boolean().nullable().optional(),
  min_bunch_amount: z.number().nullable().optional(),
  increment_bunch_amount: z.number().nullable().optional(),
});
export type PriceInstructions = z.infer<typeof PriceInstructionsSchema>;

// ---------------------------------------------------------------------------
// /api/categories/
// ---------------------------------------------------------------------------

const SubCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  order: z.number().nullable().optional(),
  layout: z.number().nullable().optional(),
  published: z.boolean().nullable().optional(),
  is_extended: z.boolean().nullable().optional(),
});

export const CategoriesIndexSchema = z.object({
  count: z.number().optional(),
  next: z.string().nullable().optional(),
  previous: z.string().nullable().optional(),
  results: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      order: z.number().nullable().optional(),
      is_extended: z.boolean().nullable().optional(),
      icon_url: z.string().nullable().optional(),
      categories: z.array(SubCategorySchema).optional(),
    }),
  ),
});
export type CategoriesIndex = z.infer<typeof CategoriesIndexSchema>;

// ---------------------------------------------------------------------------
// /api/categories/{id}/  — trae los productos en formato listado
// ---------------------------------------------------------------------------

/** Lo que hace falta del listado: enumerar ids. El EAN aquí NO viene. */
export const ProductListingSchema = z.object({
  id: IdAsString,
  slug: z.string().optional(),
  display_name: z.string(),
  packaging: z.string().nullable().optional(),
  published: z.boolean().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  price_instructions: PriceInstructionsSchema,
});
export type ProductListing = z.infer<typeof ProductListingSchema>;

export const CategoryDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  order: z.number().nullable().optional(),
  layout: z.number().nullable().optional(),
  published: z.boolean().nullable().optional(),
  is_extended: z.boolean().nullable().optional(),
  next_category: z.unknown().optional(),
  categories: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        order: z.number().nullable().optional(),
        layout: z.number().nullable().optional(),
        published: z.boolean().nullable().optional(),
        products: z.array(ProductListingSchema).optional(),
      }),
    )
    .optional(),
  products: z.array(ProductListingSchema).optional(),
});
export type CategoryDetail = z.infer<typeof CategoryDetailSchema>;

// ---------------------------------------------------------------------------
// /api/products/{id}/
// ---------------------------------------------------------------------------

const PhotoSchema = z.object({
  zoom: z.string().nullable().optional(),
  regular: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  perspective: z.number().nullable().optional(),
});

/** La ruta de categorías viene anidada, con profundidad variable. */
export interface CategoryRef {
  id: number;
  name: string;
  level?: number | null;
  order?: number | null;
  categories?: CategoryRef[];
}

export const CategoryRefSchema: z.ZodType<CategoryRef> = z.lazy(() =>
  z.object({
    id: z.number(),
    name: z.string(),
    level: z.number().nullable().optional(),
    order: z.number().nullable().optional(),
    categories: z.array(CategoryRefSchema).optional(),
  }),
);

const ProductDetailsSchema = z.object({
  brand: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  legal_name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  counter_info: z.unknown().optional(),
  danger_mentions: z.string().nullable().optional(),
  alcohol_by_volume: z.unknown().optional(),
  mandatory_mentions: z.string().nullable().optional(),
  production_variant: z.string().nullable().optional(),
  usage_instructions: z.string().nullable().optional(),
  storage_instructions: z.string().nullable().optional(),
  is_prepared_by_mercadona: z.boolean().nullable().optional(),
  suppliers: z.array(z.object({ name: z.string().nullable().optional() })).optional(),
});

/**
 * Ojo con `nutrition_information`: en toda la API solo trae `allergens` e
 * `ingredients`. No hay kcal ni macros. Los campos opcionales de abajo están
 * puestos por si algún día aparecieran — si aparecen, `build` los contará
 * como `fuente: "mercadona"` sin más cambios.
 */
export const NutritionInformationSchema = z.object({
  allergens: z.string().nullable().optional(),
  ingredients: z.string().nullable().optional(),
});

export const ProductDetailSchema = z.object({
  id: IdAsString,
  ean: z.string().nullable().optional(),
  slug: z.string(),
  brand: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  display_name: z.string(),
  packaging: z.string().nullable().optional(),
  published: z.boolean().nullable().optional(),
  limit: z.number().nullable().optional(),
  share_url: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  main_feature: z.string().nullable().optional(),
  unavailable_from: z.string().nullable().optional(),
  unavailable_weekdays: z.array(z.unknown()).optional(),
  is_bulk: z.boolean().nullable().optional(),
  is_variable_weight: z.boolean().nullable().optional(),
  is_new_arrival: z.boolean().nullable().optional(),
  status: z.unknown().optional(),
  color_variants: z.unknown().optional(),
  extra_info: z.array(z.string().nullable()).nullable().optional(),
  badges: z.record(z.unknown()).nullable().optional(),
  photos: z.array(PhotoSchema).nullable().optional(),
  categories: z.array(CategoryRefSchema).optional(),
  details: ProductDetailsSchema.nullable().optional(),
  nutrition_information: NutritionInformationSchema.nullable().optional(),
  price_instructions: PriceInstructionsSchema,
});
export type ProductDetail = z.infer<typeof ProductDetailSchema>;

/**
 * Claves de nivel superior que conocemos en la ficha de producto. Si aparece
 * una que no está aquí, la API ha cambiado: no es un error, pero sale en el
 * informe para que lo miremos.
 */
export const KNOWN_PRODUCT_KEYS: ReadonlySet<string> = new Set([
  'id', 'ean', 'slug', 'brand', 'limit', 'badges', 'origin', 'photos', 'status',
  'details', 'is_bulk', 'packaging', 'published', 'share_url', 'thumbnail',
  'categories', 'extra_info', 'display_name', 'main_feature', 'unavailable_from',
  'is_variable_weight', 'price_instructions', 'unavailable_weekdays',
  'nutrition_information', 'is_new_arrival', 'color_variants',
]);
