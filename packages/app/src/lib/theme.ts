export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'recetas:theme';

/**
 * `auto` no escribe nada en el <html>: deja mandar a `prefers-color-scheme`,
 * que es lo que hacen los tokens de styles.css.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);

  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Modo privado o almacenamiento bloqueado: el tema simplemente no persiste.
  }
}

export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch {
    // ignorado a propósito
  }
  return 'auto';
}
