/**
 * Esquema de la respuesta de Open Food Facts.
 *
 * OFF es colaborativo: cualquiera puede editar una ficha, y los campos
 * aparecen y desaparecen. Aquí solo se exige lo mínimo (`status`) y todo lo
 * demás es opcional, porque un producto sin nutrientes es un resultado
 * normal, no un error. Lo que sí se valida con dureza son los VALORES, en
 * normalize/nutrition.ts: es donde está el riesgo real.
 */
import { z } from 'zod';

/** Los números llegan a veces como cadena ("12.5"). */
const NumberLike = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  });

export const NutrimentsSchema = z.object({
  'energy-kcal_100g': NumberLike,
  proteins_100g: NumberLike,
  carbohydrates_100g: NumberLike,
  sugars_100g: NumberLike,
  fat_100g: NumberLike,
  'saturated-fat_100g': NumberLike,
  fiber_100g: NumberLike,
  salt_100g: NumberLike,
});
export type Nutriments = z.infer<typeof NutrimentsSchema>;

export const OffResponseSchema = z.object({
  /** 1 = encontrado, 0 = no está en la base. */
  status: z.number(),
  code: z.union([z.string(), z.number()]).optional(),
  product: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      product_name: z.string().nullable().optional(),
      brands: z.string().nullable().optional(),
      nutriments: NutrimentsSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type OffResponse = z.infer<typeof OffResponseSchema>;
