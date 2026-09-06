/**
 * Normalización para búsqueda offline: minúsculas, sin acentos y partido por
 * lo que no sea letra o número. "Aceite de oliva 0,4º Hacendado" pasa a ser
 * ["aceite", "de", "oliva", "0", "4", "hacendado"].
 *
 * Sin acentos porque escribiendo con una mano en el supermercado nadie pone
 * la tilde de "plátano".
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function tokenize(input: string): string[] {
  const seen = new Set<string>();
  for (const token of normalizeText(input).split(/[^\p{Letter}\p{Number}]+/u)) {
    if (token.length > 0) seen.add(token);
  }
  return [...seen];
}
