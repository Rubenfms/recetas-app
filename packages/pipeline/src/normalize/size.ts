import type { NetContent } from '@recetas/shared';
import type { PriceInstructions } from '../mercadona/schemas.js';

/**
 * Contenido neto a g/ml.
 *
 * Se calcula SOLO desde `unit_size` + `size_format`. `total_units` y
 * `pack_size` no se usan aquí a propósito: no cuadran con `unit_size` en ~9%
 * de los packs (en las aceitunas `pack_size` es el peso escurrido; en algunos
 * helados mezclan kg con litros). Se conservan crudos en `rawSize` para poder
 * mirarlos, pero no se les da autoridad.
 *
 * Distribución real de `size_format` sobre 4.321 productos:
 *   kg 2419 · l 1352 · ud 548 · m 2
 */
export function toNetContent(pi: PriceInstructions): NetContent | null {
  const size = pi.unit_size;
  const format = pi.size_format?.trim().toLowerCase();

  if (size == null || !Number.isFinite(size) || size <= 0) return null;
  if (!format) return null;

  switch (format) {
    case 'kg':
      return { amount: round(size * 1000), unit: 'g' };
    case 'g':
      return { amount: round(size), unit: 'g' };
    case 'l':
      return { amount: round(size * 1000), unit: 'ml' };
    case 'ml':
      return { amount: round(size), unit: 'ml' };
    // "ud" (548 productos: huevos, piezas) y "m" (2: film, papel de aluminio)
    // no tienen conversión posible a masa ni volumen.
    default:
      return null;
  }
}

/** Tres decimales bastan: 0,001 g. Evita los 0.30000000000000004 de siempre. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Precios y porcentajes llegan como string, a veces con padding
 * (`previous_unit_price: "       17.75"`). Devuelve `null` si no hay valor y
 * lanza si hay valor pero no es un número: eso sería un cambio de la API y
 * tiene que verse.
 */
export function toNumber(value: string | number | null | undefined, field: string, productId: string): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `El producto ${productId} trae ${field}=${JSON.stringify(value)}, que no es un número. ` +
        `La API de Mercadona ha cambiado el formato de este campo.`,
    );
  }
  return parsed;
}
