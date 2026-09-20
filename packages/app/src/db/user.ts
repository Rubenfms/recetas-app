import Dexie, { type Table } from 'dexie';
import type { FuenteNutricional } from '@recetas/shared';

/**
 * Base de datos de MIS DATOS.
 *
 * RESTRICCIÓN DURA: esto no se sobrescribe nunca. La actualización del
 * catálogo no abre esta base ni para leer — por eso son dos bases distintas y
 * no dos tablas de la misma. Si algún día alguien escribe aquí desde el
 * cargador del dataset, será un cambio deliberado y visible en el diff.
 */

/**
 * Cantidad de un ingrediente. Además de g/ml admite unidades, porque hay
 * productos que se venden así (huevos, piezas) y una receta dice "6 huevos",
 * no "360 g de huevo".
 */
export type QuantityUnit = 'g' | 'ml' | 'ud';
export interface Quantity {
  amount: number;
  unit: QuantityUnit;
}

export interface Recipe {
  id: string;
  name: string;
  /** Porciones que salen de la receta, para repartir coste y macros. */
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  notes: string | null;
  /**
   * Foto propia, ya redimensionada. Vive solo aquí: no sale del móvil y no
   * toca el repo. La copia de seguridad la codifica en base64.
   */
  photo: Blob | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  /** Id de Mercadona, si el ingrediente es un producto del catálogo. */
  productId: string | null;
  /** EAN, que sobrevive a que Mercadona cambie sus ids internos. */
  ean: string | null;
  /** Nombre en el momento de añadirlo, por si el producto desaparece. */
  label: string;
  quantity: Quantity | null;
}

export interface Favorite {
  productId: string;
  /** Se guarda además del id porque sobrevive a que Mercadona cambie los suyos. */
  ean: string | null;
  addedAt: string;
}

export interface LogEntry {
  id: string;
  /** YYYY-MM-DD. Índice del registro diario. */
  date: string;
  productId: string | null;
  recipeId: string | null;
  label: string;
  quantity: Quantity | null;
  createdAt: string;
}

/**
 * Correcciones nutricionales mías. Van aquí, y no en el catálogo, porque son
 * un dato mío: si estuvieran en `recetas-catalog` se perderían en la siguiente
 * actualización. Al leer un producto, esto gana sobre lo que traiga el dataset.
 */
export interface NutritionOverride {
  /** Se indexa por EAN cuando existe, porque es más estable que el id. */
  productId: string;
  ean: string | null;
  per: '100g' | '100ml';
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  sugars_g: number | null;
  fat_g: number | null;
  saturates_g: number | null;
  fiber_g: number | null;
  salt_g: number | null;
  /** Siempre 'manual' aquí: por definición lo he metido yo. */
  fuente: Extract<FuenteNutricional, 'manual'>;
  updatedAt: string;
  notas: string | null;
}

class UserDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  favorites!: Table<Favorite, string>;
  logEntries!: Table<LogEntry, string>;
  nutritionOverrides!: Table<NutritionOverride, string>;

  constructor() {
    super('recetas-user');
    this.version(1).stores({
      recipes: 'id, name, updatedAt',
      favorites: 'productId, addedAt',
      logEntries: 'id, date, productId, recipeId',
      nutritionOverrides: 'productId, ean, updatedAt',
    });
  }
}

export const userDb = new UserDatabase();

/**
 * Corrección manual de un producto, si la hay. La usa la ficha para resolver
 * `manual > catálogo`.
 */
export async function getNutritionOverride(
  productId: string,
): Promise<NutritionOverride | undefined> {
  return userDb.nutritionOverrides.get(productId);
}

// ---------------------------------------------------------------- favoritos

export async function isFavorite(productId: string): Promise<boolean> {
  return (await userDb.favorites.get(productId)) !== undefined;
}

/** Devuelve el estado resultante, para que la interfaz no tenga que suponerlo. */
export async function toggleFavorite(productId: string, ean: string | null): Promise<boolean> {
  const existing = await userDb.favorites.get(productId);
  if (existing) {
    await userDb.favorites.delete(productId);
    return false;
  }
  await userDb.favorites.put({ productId, ean, addedAt: new Date().toISOString() });
  return true;
}

/** Más recientes primero: lo último que guardas suele ser lo que buscas. */
export async function listFavorites(): Promise<Favorite[]> {
  const all = await userDb.favorites.toArray();
  return all.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function countUserData(): Promise<Record<string, number>> {
  const [recipes, favorites, logEntries, nutritionOverrides] = await Promise.all([
    userDb.recipes.count(),
    userDb.favorites.count(),
    userDb.logEntries.count(),
    userDb.nutritionOverrides.count(),
  ]);
  return { recipes, favorites, logEntries, nutritionOverrides };
}

// ---------------------------------------------------------------- recetas

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Las últimas tocadas primero. */
export async function listRecipes(): Promise<Recipe[]> {
  const all = await userDb.recipes.toArray();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return userDb.recipes.get(id);
}

export async function saveRecipe(recipe: Recipe): Promise<void> {
  await userDb.recipes.put({ ...recipe, updatedAt: new Date().toISOString() });
}

export async function deleteRecipe(id: string): Promise<void> {
  await userDb.recipes.delete(id);
}
