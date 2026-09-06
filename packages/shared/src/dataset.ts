/**
 * El contrato de `dataset.json`: el único punto de contacto en tiempo de
 * ejecución entre el pipeline (A) y la PWA (B).
 *
 * Aquí no va lógica de ninguna de las dos mitades. Solo la forma del fichero,
 * escrita una vez, para que no puedan derivar por separado.
 *
 * El dataset contiene SOLO alimentación. Limpieza, cosmética, mascotas y
 * parafarmacia ni se descargan: el scope de la app es la comida, y filtrarlo
 * en el origen ahorra 25 minutos de rastreo y 2 MB en cada actualización.
 */
import { z } from 'zod';

/**
 * Versión del formato. Súbela si cambia de forma incompatible: la app compara
 * esto con lo que tiene guardado y vuelve a descargar si no coincide.
 *
 * 2 — el dataset es solo de alimentación. Desaparece `isFood`, que en un
 *     catálogo donde todo es comida no distinguía nada.
 * 1 — catálogo completo con limpieza, cosmética y mascotas.
 */
export const DATASET_SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Nutrición
// ---------------------------------------------------------------------------

/**
 * De dónde salen los macros. RESTRICCIÓN DURA: todo valor nutricional lleva
 * este campo, siempre, sin excepción.
 *
 * - `mercadona`     — vendría de la ficha oficial. Hoy nunca ocurre: la API no
 *                     expone valores nutricionales (ver ARCHITECTURE.md).
 * - `openfoodfacts` — cruce por EAN. Pendiente, sesión posterior.
 * - `generico`      — estimado desde un alimento genérico equivalente.
 * - `manual`        — introducido por mí. Vive en la BD de usuario, no en el
 *                     catálogo, porque es un dato mío y no se sobrescribe.
 */
export const FuenteNutricionalSchema = z.enum([
  'mercadona',
  'openfoodfacts',
  'generico',
  'manual',
]);
export type FuenteNutricional = z.infer<typeof FuenteNutricionalSchema>;

/** Valores por 100 g o por 100 ml, según `per`. `null` = dato no disponible. */
export const NutritionSchema = z.object({
  per: z.enum(['100g', '100ml']),
  kcal: z.number().nullable(),
  protein_g: z.number().nullable(),
  carbs_g: z.number().nullable(),
  sugars_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  saturates_g: z.number().nullable(),
  fiber_g: z.number().nullable(),
  salt_g: z.number().nullable(),
  fuente: FuenteNutricionalSchema,
  /** ISO 8601. Cuándo se obtuvo el valor. */
  obtenidoEl: z.string(),
  /** Traza libre: id de OFF, nombre del genérico usado, etc. */
  notas: z.string().nullable().optional(),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

// ---------------------------------------------------------------------------
// Producto de catálogo
// ---------------------------------------------------------------------------

/** Contenido neto normalizado a gramos o mililitros. */
export const NetContentSchema = z.object({
  amount: z.number(),
  unit: z.enum(['g', 'ml']),
});
export type NetContent = z.infer<typeof NetContentSchema>;

export const PhotoSchema = z.object({
  thumbnail: z.string(),
  regular: z.string(),
  zoom: z.string(),
  perspective: z.number().nullable(),
});
export type Photo = z.infer<typeof PhotoSchema>;

/**
 * Los campos de tamaño tal y como los da Mercadona, sin interpretar.
 * Se conservan porque no son coherentes entre sí (`total_units * pack_size`
 * no cuadra con `unit_size` en ~9% de los packs) y porque alguna vez habrá que
 * mirar el original para entender un caso raro.
 */
export const RawSizeSchema = z.object({
  unitSize: z.number().nullable(),
  sizeFormat: z.string().nullable(),
  totalUnits: z.number().nullable(),
  packSize: z.number().nullable(),
  unitName: z.string().nullable(),
  drainedWeight: z.number().nullable(),
  approxSize: z.boolean(),
  isPack: z.boolean(),
  isBulk: z.boolean(),
  isVariableWeight: z.boolean(),
  sellingMethod: z.number().nullable(),
});
export type RawSize = z.infer<typeof RawSizeSchema>;

export const PriceSchema = z.object({
  /** Precio de lo que compras, en euros. */
  unit: z.number().nullable(),
  /** Precio por unidad de referencia (`referenceFormat`), en euros. */
  reference: z.number().nullable(),
  /** "kg", "L", "ud", "100 ml", "100 g", "lv"… tal cual lo da la API. */
  referenceFormat: z.string().nullable(),
  previousUnit: z.number().nullable(),
  taxPercentage: z.number().nullable(),
});
export type Price = z.infer<typeof PriceSchema>;

export const CatalogProductSchema = z.object({
  /** Id interno de Mercadona. Estable mientras el producto exista. */
  id: z.string(),
  /** EAN13. `null` si la ficha no lo trae. Referencia cruzada con OFF. */
  ean: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  origin: z.string().nullable(),
  packaging: z.string().nullable(),

  /** Ruta de categorías, de nivel 0 hacia dentro. Ids de `categories`. */
  categoryPath: z.array(z.number()),

  /** Normalizado a g/ml. `null` cuando se vende por unidades o por metros. */
  netContent: NetContentSchema.nullable(),
  rawSize: RawSizeSchema,
  price: PriceSchema,
  photos: z.array(PhotoSchema),

  /** HTML con `<strong>` marcando alérgenos. Sanitizar antes de pintar. */
  ingredients: z.string().nullable(),
  allergens: z.string().nullable(),

  /**
   * Hoy siempre `null`: Mercadona no publica macros. El hueco está modelado
   * para el cruce con Open Food Facts y para los genéricos.
   */
  nutrition: NutritionSchema.nullable(),
});
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export const CatalogCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  parentId: z.number().nullable(),
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

// ---------------------------------------------------------------------------
// El fichero
// ---------------------------------------------------------------------------

export const DatasetSourceSchema = z.object({
  provider: z.literal('mercadona'),
  apiBase: z.string(),
  postalCode: z.string(),
  /** Código de almacén usado, o `"default"` si se dejó el de la API. */
  warehouse: z.string(),
  /** Fecha del volcado crudo del que salió este dataset (YYYY-MM-DD). */
  rawDump: z.string(),
});
export type DatasetSource = z.infer<typeof DatasetSourceSchema>;

export const DatasetCountsSchema = z.object({
  products: z.number(),
  withNutrition: z.number(),
  withoutEan: z.number(),
  withNetContent: z.number(),
  withPhotos: z.number(),
});
export type DatasetCounts = z.infer<typeof DatasetCountsSchema>;

export const DatasetSchema = z.object({
  schemaVersion: z.number(),
  generatedAt: z.string(),
  source: DatasetSourceSchema,
  counts: DatasetCountsSchema,
  categories: z.array(CatalogCategorySchema),
  products: z.array(CatalogProductSchema),
});
export type Dataset = z.infer<typeof DatasetSchema>;
