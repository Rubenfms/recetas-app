import './styles.css';
import { checkForUpdate, ensureCatalog } from './bootstrap/loader.js';
import { renderBootScreen } from './ui/boot.js';
import { mountApp } from './ui/app.js';

const root = document.querySelector<HTMLElement>('#app');

async function start(): Promise<void> {
  if (!root) throw new Error('Falta el contenedor #app en index.html');

  const setBootState = renderBootScreen(root);

  let justDownloaded: boolean;
  try {
    justDownloaded = await ensureCatalog(setBootState);
  } catch (err) {
    setBootState({
      phase: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await mountApp(root);

  // A partir de aquí la app ya está viva y no depende de la red. Si hay un
  // dataset nuevo se cambia por debajo; si no hay cobertura, no pasa nada.
  // Si acabamos de descargarlo no tiene sentido volver a pedirlo.
  if (justDownloaded) return;

  void checkForUpdate(() => {
    /* silencioso */
  }).then((result) => {
    if (result === 'updated') void mountApp(root);
  });
}

void start();
