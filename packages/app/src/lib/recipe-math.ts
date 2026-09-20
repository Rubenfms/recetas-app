import type { StoredProduct } from '../db/catalog.js';
import type { Quantity, RecipeIngredient } from '../db/user.js';

/**
 * Coste y macros de una receta, a partir de lo que trae el catálogo.
 *
 * Funciones puras: entran ingredientes y productos, salen números y, sobre
 * todo, QUÉ FALTA. Una receta con un ingrediente sin precio no tiene "coste
 * 3,20 €": tiene "3,20 € más un ingrediente que no sé". Esa diferencia se
 * lleva hasta la pantalla.
 */

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugars_g: number | null;
  saturates_g: number | null;
  fiber_g: number | null;
  salt_g: number | null;
}

export type Missing = 'producto' | 'cantidad' | 'precio' | 'macros';

export interface IngredientLine {
  ingredient: RecipeIngredient;
  /** `null` si es texto libre o el producto ya no está en el catálogo. */
  product: StoredProduct | null;
  quantity: Quantity | null;
  cost: number | null;
  /** Cantidad equivalente en g/ml, que es la base de los macros. */
  grams: number | null;
  macros: Macros | null;
  missing: Missing[];
}

export interface RecipeTotals {
  cost: number;
  costMissing: number;
  macros: Macros;
  macrosMissing: number;
  /** Ingredientes que no aportan ni coste ni macros por no tener cantidad. */
  quantityMissing: number;
  perServing: { cost: number; macros: Macros };
}

/** "kg", "L", "100 g", "100 ml", "ud", "dz"… tal cual lo da Mercadona. */
function normalizeFormat(format: string | null): string {
  return (format ?? '').toLowerCase().replace(/\s+/g, '');
}

/** Unidades por envase, si el producto lo dice. Si no, el envase es 1 unidad. */
function unitsPerPackage(product: StoredProduct): number {
  const { totalUnits, sizeFormat, unitSize } = product.rawSize;
  if (totalUnits && totalUnits > 0) return totalUnits;
  if (sizeFormat === 'ud' && unitSize && unitSize > 0) return unitSize;
  return 1;
}

/**
 * Coste de una cantidad de producto. Se prefiere el precio de referencia
 * (€/kg, €/L, €/100 g…) porque es el que Mercadona calcula sobre el contenido
 * neto real; el precio del envase entre su contenido es el plan B.
 *
 * 1 ml se trata como 1 g cuando la referencia va por peso y la cantidad por
 * volumen: para lo que se come, la diferencia es menor que la del precio de
 * un día a otro.
 */
export function costOf(product: StoredProduct, q: Quantity): number | null {
  const ref = product.price.reference;
  const fmt = normalizeFormat(product.price.referenceFormat);
  const unitPrice = product.price.unit;

  if (q.unit === 'g' || q.unit === 'ml') {
    if (ref != null) {
      if (fmt === 'kg' || fmt === 'l') return (ref * q.amount) / 1000;
      if (fmt === '100g' || fmt === '100ml') return (ref * q.amount) / 100;
    }
    if (unitPrice != null && product.netContent && product.netContent.amount > 0) {
      return (unitPrice * q.amount) / product.netContent.amount;
    }
    return null;
  }

  // Unidades.
  if (ref != null) {
    if (fmt === 'ud') return ref * q.amount;
    if (fmt === 'dz') return (ref / 12) * q.amount;
  }
  if (unitPrice != null) return (unitPrice / unitsPerPackage(product)) * q.amount;
  return null;
}

/**
 * Gramos (o ml) equivalentes a una cantidad, que es lo que hace falta para
 * aplicar unos macros por 100 g. Para unidades se usa el contenido neto del
 * envase entre sus unidades: un pack de 8 yogures de 1 kg son 125 g cada uno,
 * una patata "pieza" de ~240 g son 240 g. Sin contenido neto (huevos) no se
 * puede saber, y se dice.
 */
export function gramsOf(product: StoredProduct, q: Quantity): number | null {
  if (q.unit === 'g' || q.unit === 'ml') return q.amount;
  if (product.netContent && product.netContent.amount > 0) {
    return (product.netContent.amount / unitsPerPackage(product)) * q.amount;
  }
  return null;
}

/** Los macros por 100 g/ml, escalados. 100 ml se tratan como 100 g. */
export function macrosOf(product: StoredProduct, grams: number): Macros | null {
  const n = product.nutrition;
  if (!n || n.kcal == null || n.protein_g == null || n.carbs_g == null || n.fat_g == null) {
    return null;
  }
  const f = grams / 100;
  const opt = (v: number | null): number | null => (v == null ? null : v * f);
  return {
    kcal: n.kcal * f,
    protein_g: n.protein_g * f,
    carbs_g: n.carbs_g * f,
    fat_g: n.fat_g * f,
    sugars_g: opt(n.sugars_g),
    saturates_g: opt(n.saturates_g),
    fiber_g: opt(n.fiber_g),
    salt_g: opt(n.salt_g),
  };
}

export function scaleQuantity(q: Quantity, factor: number): Quantity {
  return { amount: q.amount * factor, unit: q.unit };
}

export function computeLine(
  ingredient: RecipeIngredient,
  product: StoredProduct | null,
  factor = 1,
): IngredientLine {
  const quantity = ingredient.quantity ? scaleQuantity(ingredient.quantity, factor) : null;
  const missing: Missing[] = [];

  if (!product) missing.push('producto');
  if (!quantity) missing.push('cantidad');
  if (!product || !quantity) {
    return { ingredient, product, quantity, cost: null, grams: null, macros: null, missing };
  }

  const cost = costOf(product, quantity);
  if (cost === null) missing.push('precio');

  const grams = gramsOf(product, quantity);
  const macros = grams === null ? null : macrosOf(product, grams);
  if (macros === null) missing.push('macros');

  return { ingredient, product, quantity, cost, grams, macros, missing };
}

const ZERO: Macros = {
  kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  sugars_g: 0, saturates_g: 0, fiber_g: 0, salt_g: 0,
};

function addMacros(a: Macros, b: Macros): Macros {
  const opt = (x: number | null, y: number | null): number | null =>
    x == null || y == null ? null : x + y;
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    sugars_g: opt(a.sugars_g, b.sugars_g),
    saturates_g: opt(a.saturates_g, b.saturates_g),
    fiber_g: opt(a.fiber_g, b.fiber_g),
    salt_g: opt(a.salt_g, b.salt_g),
  };
}

function divideMacros(m: Macros, by: number): Macros {
  const opt = (x: number | null): number | null => (x == null ? null : x / by);
  return {
    kcal: m.kcal / by,
    protein_g: m.protein_g / by,
    carbs_g: m.carbs_g / by,
    fat_g: m.fat_g / by,
    sugars_g: opt(m.sugars_g),
    saturates_g: opt(m.saturates_g),
    fiber_g: opt(m.fiber_g),
    salt_g: opt(m.salt_g),
  };
}

export function computeTotals(lines: IngredientLine[], servings: number): RecipeTotals {
  let cost = 0;
  let costMissing = 0;
  let macros = ZERO;
  let macrosMissing = 0;
  let quantityMissing = 0;

  for (const line of lines) {
    if (!line.quantity) {
      quantityMissing += 1;
      continue;
    }
    if (line.cost === null) costMissing += 1;
    else cost += line.cost;
    if (line.macros === null) macrosMissing += 1;
    else macros = addMacros(macros, line.macros);
  }

  const by = Math.max(1, servings);
  return {
    cost,
    costMissing,
    macros,
    macrosMissing,
    quantityMissing,
    perServing: { cost: cost / by, macros: divideMacros(macros, by) },
  };
}

/** Cantidad por defecto al añadir un producto: 100 g/ml, o 1 unidad si se vende así. */
export function defaultQuantity(product: StoredProduct): Quantity {
  if (product.netContent) return { amount: 100, unit: product.netContent.unit };
  return { amount: 1, unit: 'ud' };
}
