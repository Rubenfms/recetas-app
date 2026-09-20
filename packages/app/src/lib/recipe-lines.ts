import { getProducts, type StoredProduct } from '../db/catalog.js';
import type { Recipe } from '../db/user.js';
import { computeLine, computeTotals, type IngredientLine, type RecipeTotals } from './recipe-math.js';

export interface RecipeComputed {
  lines: IngredientLine[];
  totals: RecipeTotals;
}

/**
 * Ingredientes de una receta resueltos contra el catálogo actual. Un
 * producto que Mercadona haya retirado sale con `product: null` y su
 * `label` guardado, en vez de desaparecer de la receta.
 */
export async function computeRecipe(recipe: Recipe, servings = recipe.servings): Promise<RecipeComputed> {
  const ids = recipe.ingredients.map((i) => i.productId).filter((id): id is string => Boolean(id));
  const found = await getProducts(ids);
  const byId = new Map<string, StoredProduct>();
  ids.forEach((id, i) => {
    const p = found[i];
    if (p) byId.set(id, p);
  });

  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  const lines = recipe.ingredients.map((ing) =>
    computeLine(ing, ing.productId ? (byId.get(ing.productId) ?? null) : null, factor),
  );
  return { lines, totals: computeTotals(lines, servings) };
}
