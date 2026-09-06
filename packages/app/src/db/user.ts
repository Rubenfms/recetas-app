import Dexie, { type Table } from 'dexie';
import type { FuenteNutricional, NetContent } from '@recetas/shared';

/**
 * Base de datos de MIS DATOS.
 *
 * RESTRICCIÓN DURA: esto no se sobrescribe nunca. La actualización del
 * catálogo no abre esta base ni para leer — por eso son dos bases distintas y
 * no dos tablas de la misma. Si algún día alguien escribe aquí desde el
 * cargador del dataset, será un cambio deliberado y visible en el diff.
 *
 * Las tablas están definidas pero todavía no se usan: recetas, favoritos y
 * registro diario son de sesiones posteriores. El esquema está aquí para que
 * el modelo de datos esté preparado, como se pidió.
 */

export interface Recipe {
  id: string;
  name: string;
  /** Porciones que salen de la receta, para repartir los macros. */
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  /** Id de Mercadona, si el ingrediente es un producto del catálogo. */
  productId: string | null;
  /** EAN, que sobrevive a que Mercadona cambie sus ids internos. */
  ean: string | null;
  /** Texto libre para lo que no está en el catálogo ("sal", "agua"). */
  label: string;
  quantity: NetContent | null;
}

export interface Favorite {
  productId: string;
  addedAt: string;
}

export interface LogEntry {
  id: string;
  /** YYYY-MM-DD. Índice del registro diario. */
  date: string;
  productId: string | null;
  recipeId: string | null;
  label: string;
  quantity: NetContent | null;
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
