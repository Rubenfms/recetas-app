import type { LoadPhase } from '../bootstrap/loader.js';
import { formatBytes } from '../lib/format.js';

function progressOf(state: LoadPhase): { pct: number; text: string; error?: string } {
  switch (state.phase) {
    case 'checking':
      return { pct: 4, text: 'Comprobando si ya está descargado…' };
    case 'downloading': {
      const pct = state.total ? (state.received / state.total) * 70 : 35;
      return {
        pct: Math.max(4, pct),
        text: state.total
          ? `Descargando catálogo · ${formatBytes(state.received)} de ${formatBytes(state.total)}`
          : `Descargando catálogo · ${formatBytes(state.received)}`,
      };
    }
    case 'parsing':
      return { pct: 74, text: 'Comprobando el catálogo…' };
    case 'storing':
      return {
        pct: 76 + (state.inserted / Math.max(1, state.total)) * 22,
        text: `Guardando en el dispositivo · ${state.inserted} de ${state.total}`,
      };
    case 'done':
      return { pct: 100, text: `${state.products} productos listos.` };
    case 'error':
      return { pct: 100, text: 'No se pudo cargar el catálogo.', error: state.message };
  }
}

export function BootScreen({ state }: { state: LoadPhase }) {
  const { pct, text, error } = progressOf(state);

  return (
    <div class="boot">
      <img class="boot__icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <h1 class="boot__title serif">Recetas</h1>
      <p class="boot__subtitle">Preparando el catálogo para usarlo sin cobertura.</p>
      <div class="boot__bar">
        <div
          class={error ? 'boot__fill boot__fill--error' : 'boot__fill'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p class="boot__status">
        {error ? <strong>{text}</strong> : text}
        {error && (
          <>
            <br />
            {error}
          </>
        )}
      </p>
      <p class="boot__note">
        {error ? 'Comprueba la conexión y vuelve a entrar.' : 'Solo hace falta la primera vez.'}
      </p>
    </div>
  );
}
