import type { NetContent, Nutrition } from '@recetas/shared';
import { NUTRITION_LIMITS } from '../config.js';
import type { OffResponse } from '../openfoodfacts/schemas.js';

export interface NutritionOutcome {
  nutrition: Nutrition | null;
  /** Por qué no hay nutrición, cuando no la hay. Va al informe. */
  reason?: 'sin-nutrientes' | 'valores-imposibles';
  /** Qué se descartó exactamente, para poder mirarlo. */
  rejected?: string;
}

/** Un valor solo se acepta si es un número dentro de un rango plausible. */
function clean(value: number | undefined, max: number, label: string, bad: string[]): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    bad.push(`${label}=${value}`);
    return null;
  }
  return Math.round(value * 100) / 100;
}

/**
 * Ficha de Open Food Facts → nutrición del catálogo.
 *
 * OFF da los valores por 100 g o por 100 ml sin distinguirlo en el nombre del
 * campo, así que la unidad se toma del contenido neto de Mercadona, que es
 * dato nuestro y de fiar. Si el producto se vende por unidades y no sabemos
 * si es sólido o líquido, se asume 100 g, que es lo habitual.
 *
 * RESTRICCIÓN DURA: lo que sale de aquí lleva `fuente: 'openfoodfacts'`.
 */
export function nutritionFromOff(
  off: OffResponse,
  netContent: NetContent | null,
  obtenidoEl: string,
): NutritionOutcome {
  const n = off.product?.nutriments;
  if (!n) return { nutrition: null, reason: 'sin-nutrientes' };

  const bad: string[] = [];
  const { kcalMax, gramsMax, macroSumMax } = NUTRITION_LIMITS;

  const kcal = clean(n['energy-kcal_100g'], kcalMax, 'kcal', bad);
  const protein = clean(n.proteins_100g, gramsMax, 'proteínas', bad);
  const carbs = clean(n.carbohydrates_100g, gramsMax, 'hidratos', bad);
  const fat = clean(n.fat_100g, gramsMax, 'grasas', bad);

  // Los cuatro principales son el mínimo para que la ficha diga algo útil.
  if (kcal === null || protein === null || carbs === null || fat === null) {
    return {
      nutrition: null,
      reason: bad.length > 0 ? 'valores-imposibles' : 'sin-nutrientes',
      ...(bad.length > 0 ? { rejected: bad.join(', ') } : {}),
    };
  }

  // Tres macros que suman más de 100 g por 100 g es imposible, y en OFF pasa.
  const sum = protein + carbs + fat;
  if (sum > macroSumMax) {
    return {
      nutrition: null,
      reason: 'valores-imposibles',
      rejected: `proteínas+hidratos+grasas=${sum.toFixed(1)} g por 100 g`,
    };
  }

  const name = off.product?.product_name?.trim();
  const code = off.product?.code ?? off.code;

  return {
    nutrition: {
      per: netContent?.unit === 'ml' ? '100ml' : '100g',
      kcal,
      protein_g: protein,
      carbs_g: carbs,
      sugars_g: clean(n.sugars_100g, gramsMax, 'azúcares', bad),
      fat_g: fat,
      saturates_g: clean(n['saturated-fat_100g'], gramsMax, 'saturadas', bad),
      fiber_g: clean(n.fiber_100g, gramsMax, 'fibra', bad),
      salt_g: clean(n.salt_100g, gramsMax, 'sal', bad),
      fuente: 'openfoodfacts',
      obtenidoEl,
      notas: name ? `Open Food Facts: «${name}» (${String(code ?? '')})` : `Open Food Facts (${String(code ?? '')})`,
    },
    ...(bad.length > 0 ? { rejected: bad.join(', ') } : {}),
  };
}
