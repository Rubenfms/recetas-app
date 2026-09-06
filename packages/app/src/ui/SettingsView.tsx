import { useEffect, useRef, useState } from 'preact/hooks';
import { checkForUpdate } from '../bootstrap/loader.js';
import { getDatasetSource, getLoadedDatasetStamp } from '../db/catalog.js';
import { countUserData } from '../db/user.js';
import { exportBackup, readBackup, restoreBackup } from '../db/backup.js';
import { formatBytes, formatDate } from '../lib/format.js';
import { goBack } from '../lib/router.js';
import { isInstalled, isIos, requestPersistence, type StorageState } from '../lib/storage.js';
import { applyTheme, readTheme, type ThemeChoice } from '../lib/theme.js';
import { IconBack, IconShare, IconUpload } from './icons.js';

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'auto', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export function SettingsView({ onCatalogReplaced }: { onCatalogReplaced: () => void }) {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [stamp, setStamp] = useState<string | null>(null);
  const [source, setSource] = useState<Record<string, unknown> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storage, setStorage] = useState<StorageState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; warn?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async (): Promise<void> => {
    const [loaded, src, userCounts] = await Promise.all([
      getLoadedDatasetStamp(),
      getDatasetSource(),
      countUserData(),
    ]);
    setStamp(loaded);
    setSource(src);
    setCounts(userCounts);
  };

  useEffect(() => {
    void refresh();
    void requestPersistence().then(setStorage);
  }, []);

  const onExport = async (): Promise<void> => {
    setBusy('export');
    setMessage(null);
    try {
      const how = await exportBackup();
      setMessage({
        text: how === 'shared' ? 'Copia compartida.' : 'Copia descargada.',
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') setMessage(null);
      else setMessage({ text: `No se pudo exportar: ${String(err)}`, warn: true });
    } finally {
      setBusy(null);
    }
  };

  const onImportFile = async (file: File): Promise<void> => {
    setBusy('import');
    setMessage(null);
    try {
      const { backup, summary } = readBackup(await file.text());
      const detail = Object.entries(summary.counts)
        .filter(([, n]) => n > 0)
        .map(([name, n]) => `${n} ${name}`)
        .join(', ');
      const ok = window.confirm(
        `Copia del ${formatDate(summary.exportedAt)}${detail ? ` con ${detail}` : ' (vacía)'}.\n\n` +
          'Esto REEMPLAZA tus recetas, favoritos y correcciones actuales. ¿Seguir?',
      );
      if (!ok) {
        setBusy(null);
        return;
      }
      await restoreBackup(backup);
      await refresh();
      setMessage({ text: 'Datos restaurados.' });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'No se pudo importar el fichero.',
        warn: true,
      });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onCheckUpdate = async (): Promise<void> => {
    setBusy('update');
    setMessage(null);
    const result = await checkForUpdate(() => undefined);
    await refresh();
    setBusy(null);
    if (result === 'updated') {
      setMessage({ text: 'Catálogo actualizado.' });
      onCatalogReplaced();
    } else if (result === 'up-to-date') {
      setMessage({ text: 'Ya tenías el catálogo más reciente.' });
    } else {
      setMessage({ text: 'Sin conexión: seguimos con el catálogo descargado.', warn: true });
    }
  };

  const postalCode = typeof source?.['postalCode'] === 'string' ? source['postalCode'] : '—';
  const warehouse = typeof source?.['warehouse'] === 'string' ? source['warehouse'] : '—';
  const mine = (counts['recipes'] ?? 0) + (counts['favorites'] ?? 0) + (counts['logEntries'] ?? 0) +
    (counts['nutritionOverrides'] ?? 0);

  return (
    <div class="page">
      <div class="detail__bar">
        <button class="iconbtn" type="button" aria-label="Volver" onClick={() => goBack({ name: 'buscar' })}>
          <IconBack />
        </button>
      </div>

      <div class="page__pad">
        <h1 class="page__title serif" style={{ marginBottom: '18px' }}>
          Ajustes
        </h1>

        {message && (
          <p class={message.warn ? 'notice notice--warn' : 'notice'} style={{ margin: '0 0 16px' }}>
            {message.text}
          </p>
        )}

        <h2 class="eyebrow" style={{ margin: '4px 0 0' }}>
          Apariencia
        </h2>
        <div class="setting">
          <div>
            <div class="setting__label">Tema</div>
            <div class="setting__hint">Claro por defecto; el oscuro sigue al ajuste del móvil.</div>
          </div>
          <div class="segment">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                onClick={() => {
                  setTheme(option.value);
                  applyTheme(option.value);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <h2 class="eyebrow" style={{ margin: '26px 0 0' }}>
          Mis datos
        </h2>
        <div class="setting">
          <div>
            <div class="setting__label">
              {mine === 0 ? 'Nada guardado todavía' : `${mine} cosas guardadas`}
            </div>
            <div class="setting__hint">
              {counts['favorites'] ?? 0} favoritos · {counts['recipes'] ?? 0} recetas.
              Viven solo en este móvil y no se suben a ningún sitio.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          <button
            class="btn"
            type="button"
            style={{ flex: 1 }}
            disabled={busy !== null}
            onClick={() => void onExport()}
          >
            <IconShare />
            {busy === 'export' ? 'Exportando…' : 'Exportar'}
          </button>
          <button
            class="btn"
            type="button"
            style={{ flex: 1 }}
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            <IconUpload />
            {busy === 'import' ? 'Importando…' : 'Importar'}
          </button>
        </div>
        <input
          ref={fileRef}
          class="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) void onImportFile(file);
          }}
        />
        <p class="setting__hint" style={{ marginTop: '10px' }}>
          Importar reemplaza lo que tengas. Exporta antes de cambiar de móvil o de
          limpiar los datos del navegador.
        </p>

        <h2 class="eyebrow" style={{ margin: '26px 0 0' }}>
          Almacenamiento
        </h2>
        <div class="setting">
          <div>
            <div class="setting__label">
              {storage === null
                ? 'Comprobando…'
                : storage.unsupported
                  ? 'El navegador no lo dice'
                  : storage.persisted
                    ? 'Persistente'
                    : 'Sin garantía'}
            </div>
            <div class="setting__hint">
              {storage?.persisted
                ? 'El navegador se ha comprometido a no borrarlo por su cuenta.'
                : isIos() && !isInstalled()
                  ? 'En iPhone, añádela a la pantalla de inicio desde Compartir: así Safari deja de poder desalojar tus datos.'
                  : 'Exporta una copia de vez en cuando por si acaso.'}
              {storage?.usageBytes != null && ` Ocupa ${formatBytes(storage.usageBytes)}.`}
            </div>
          </div>
        </div>

        <h2 class="eyebrow" style={{ margin: '26px 0 0' }}>
          Catálogo
        </h2>
        <div class="setting">
          <div>
            <div class="setting__label">
              {stamp ? `Del ${formatDate(stamp)}` : 'Sin descargar'}
            </div>
            <div class="setting__hint">
              CP {postalCode} · almacén {warehouse}. Se reemplaza entero al actualizar;
              tus datos no se tocan.
            </div>
          </div>
        </div>
        <button
          class="btn btn--full"
          type="button"
          style={{ marginTop: '14px' }}
          disabled={busy !== null}
          onClick={() => void onCheckUpdate()}
        >
          {busy === 'update' ? 'Comprobando…' : 'Buscar catálogo nuevo'}
        </button>

        <p class="setting__hint" style={{ margin: '26px 0 40px' }}>
          Los precios y el surtido son los que Mercadona publica en su web, que usa
          siempre el mismo almacén. Pueden no coincidir con tu tienda de Granada.
        </p>
      </div>
    </div>
  );
}
