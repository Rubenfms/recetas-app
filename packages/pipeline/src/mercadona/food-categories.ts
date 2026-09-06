/**
 * Qué es alimentación y qué no.
 *
 * Descargamos el catálogo entero (limpieza, cosmética, mascotas incluidas)
 * para no tener que volver a rastrear si algún día hacen falta, pero la app
 * filtra por alimentación por defecto. La clasificación es por categoría, que
 * es la única señal fiable que da la API.
 */

/** Categorías de nivel 0 que no son comida. */
const NON_FOOD_TOP_LEVEL: ReadonlySet<number> = new Set([
  20, // Cuidado facial y corporal
  21, // Cuidado del cabello
  22, // Maquillaje
  23, // Fitoterapia y parafarmacia
  25, // Mascotas
  26, // Limpieza y hogar
]);

/** Excepciones dentro de categorías de nivel 0 que sí son comida. */
const NON_FOOD_SUB_LEVEL: ReadonlySet<number> = new Set([
  217, // Bebé → Toallitas y pañales
  218, // Bebé → Higiene y cuidado
  219, // Bebé → Biberón y chupete
  71, //  Panadería y pastelería → Velas y decoración
  155, // Congelados → Hielo
]);

/**
 * `path` es la ruta de ids de nivel 0 hacia dentro. Un producto sin categoría
 * conocida se considera no-alimentación: prefiero que falte en la búsqueda de
 * comida a que aparezca un friegasuelos entre las recetas.
 */
export function isFoodCategoryPath(path: readonly number[]): boolean {
  const top = path[0];
  if (top === undefined) return false;
  if (NON_FOOD_TOP_LEVEL.has(top)) return false;
  return !path.some((id) => NON_FOOD_SUB_LEVEL.has(id));
}
