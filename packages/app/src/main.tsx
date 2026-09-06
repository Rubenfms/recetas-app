import { render } from 'preact';
import './styles.css';
import { App } from './app.js';
import { checkForUpdate, ensureCatalog, type LoadPhase } from './bootstrap/loader.js';
import { BootScreen } from './ui/BootScreen.js';
import { requestPersistence } from './lib/storage.js';
import { applyTheme, readTheme } from './lib/theme.js';

const root = document.querySelector<HTMLElement>('#app');

async function start(): Promise<void> {
  if (!root) throw new Error('Falta el contenedor #app en index.html');

  applyTheme(readTheme());

  const paint = (state: LoadPhase): void => render(<BootScreen state={state} />, root);
  paint({ phase: 'checking' });

  let justDownloaded: boolean;
  try {
    justDownloaded = await ensureCatalog(paint);
  } catch (err) {
    paint({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    return;
  }

  render(<App />, root);

  // Pedir persistencia después de tener algo que persistir: así la pregunta
  // del navegador, si la hace, llega cuando ya hay motivo.
  void requestPersistence();

  // A partir de aquí la app ya está viva y no depende de la red. Si acabamos
  // de descargar el catálogo no tiene sentido volver a pedirlo.
  if (justDownloaded) return;

  void checkForUpdate(() => undefined).then((result) => {
    if (result === 'updated') render(<App />, root);
  });
}

void start();
