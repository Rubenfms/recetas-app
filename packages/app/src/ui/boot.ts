import type { LoadPhase } from '../bootstrap/loader.js';
import { escapeHtml, formatBytes } from './format.js';

/**
 * Pantalla del primer arranque. Es la única vez que la app depende de la red,
 * así que dice en todo momento qué está haciendo y cuánto lleva.
 */
export function renderBootScreen(root: HTMLElement): (state: LoadPhase) => void {
  root.innerHTML = `
    <div class="boot">
      <h1 class="boot__title">Recetas</h1>
      <p class="boot__subtitle">Preparando el catálogo para usarlo sin cobertura.</p>
      <div class="boot__bar"><div class="boot__fill" id="boot-fill"></div></div>
      <p class="boot__status" id="boot-status">Comprobando…</p>
      <p class="boot__note">Solo hace falta la primera vez.</p>
    </div>
  `;

  const fill = root.querySelector<HTMLElement>('#boot-fill');
  const status = root.querySelector<HTMLElement>('#boot-status');

  return (state: LoadPhase): void => {
    if (!fill || !status) return;

    switch (state.phase) {
      case 'checking':
        fill.style.width = '4%';
        status.textContent = 'Comprobando si ya está descargado…';
        break;
      case 'downloading': {
        const pct = state.total ? (state.received / state.total) * 70 : 35;
        fill.style.width = `${Math.max(4, pct)}%`;
        status.textContent = state.total
          ? `Descargando catálogo · ${formatBytes(state.received)} de ${formatBytes(state.total)}`
          : `Descargando catálogo · ${formatBytes(state.received)}`;
        break;
      }
      case 'parsing':
        fill.style.width = '74%';
        status.textContent = 'Comprobando el catálogo…';
        break;
      case 'storing': {
        const pct = 76 + (state.inserted / Math.max(1, state.total)) * 22;
        fill.style.width = `${pct}%`;
        status.textContent = `Guardando en el dispositivo · ${state.inserted} de ${state.total}`;
        break;
      }
      case 'done':
        fill.style.width = '100%';
        status.textContent = `${state.products} productos listos.`;
        break;
      case 'error':
        fill.style.width = '100%';
        fill.classList.add('boot__fill--error');
        status.innerHTML = `<strong>No se pudo cargar el catálogo.</strong><br>${escapeHtml(state.message)}`;
        break;
    }
  };
}
