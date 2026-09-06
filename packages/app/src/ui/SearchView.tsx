import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getProduct, searchProducts, type StoredProduct } from '../db/catalog.js';
import { listFavorites } from '../db/user.js';
import { formatPrice } from '../lib/format.js';
import { hrefFor, navigate } from '../lib/router.js';
import { FavoriteButton } from './FavoriteButton.js';
import { IconClock, IconClose, IconSearch } from './icons.js';
import { ProductRow } from './ProductRow.js';

const RESULT_LIMIT = 60;
const RECENTS_KEY = 'recetas:recientes';
const MAX_RECENTS = 6;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string): string[] {
  const clean = term.trim();
  const next = [clean, ...readRecents().filter((r) => r !== clean)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // sin almacenamiento, simplemente no hay historial
  }
  return next;
}

export function SearchView({ catalogSize }: { catalogSize: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StoredProduct[] | null>(null);
  const [recents, setRecents] = useState<string[]>(readRecents);
  const [favorites, setFavorites] = useState<StoredProduct[]>([]);
  const [favIds, setFavIds] = useState<ReadonlySet<string>>(() => new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const commitTimer = useRef<number | undefined>(undefined);
  const latestQuery = useRef('');

  const loadFavorites = useCallback(async () => {
    const rows = await listFavorites();
    setFavIds(new Set(rows.map((r) => r.productId)));
    const loaded = await Promise.all(rows.slice(0, 10).map((f) => getProduct(f.productId)));
    setFavorites(loaded.filter((p): p is StoredProduct => Boolean(p)));
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    void (async () => {
      const found = await searchProducts(query, { limit: RESULT_LIMIT });
      if (!cancelled) setResults(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  /** El histórico se guarda cuando dejas de escribir, no en cada tecla. */
  useEffect(() => {
    latestQuery.current = query;
    window.clearTimeout(commitTimer.current);
    if (query.trim().length < 3) return;
    commitTimer.current = window.setTimeout(() => setRecents(pushRecent(query)), 1200);
    return () => window.clearTimeout(commitTimer.current);
  }, [query]);

  /**
   * Y también al salir de la búsqueda, típicamente porque has abierto una
   * ficha. Con solo el temporizador, buscar y tocar deprisa —que es lo normal
   * en el súper— no dejaría rastro en el historial.
   */
  useEffect(
    () => () => {
      if (latestQuery.current.trim().length >= 3) pushRecent(latestQuery.current);
    },
    [],
  );

  const showEmptyState = results === null;

  return (
    <div class="page">
      <div class="page__head">
        <h1 class="page__title serif">Buscar</h1>
      </div>

      <div class="page__pad">
        <div class="search">
          <IconSearch size={20} />
          <input
            ref={inputRef}
            class="search__input"
            type="search"
            value={query}
            placeholder={`Buscar entre ${catalogSize.toLocaleString('es-ES')} productos`}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            enterkeyhint="search"
            aria-label="Buscar producto"
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          {query && (
            <button
              class="search__clear"
              type="button"
              aria-label="Borrar la búsqueda"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <IconClose />
            </button>
          )}
        </div>
      </div>

      {showEmptyState ? (
        <>
          {recents.length > 0 && (
            <section style={{ padding: '26px 16px 0' }}>
              <h2 class="eyebrow" style={{ margin: '0 0 12px' }}>
                Recientes
              </h2>
              <div class="chips">
                {recents.map((term) => (
                  <button key={term} class="chip" type="button" onClick={() => setQuery(term)}>
                    {term}
                  </button>
                ))}
              </div>
            </section>
          )}

          {favorites.length > 0 && (
            <section style={{ padding: '28px 0 0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  marginBottom: '12px',
                }}
              >
                <h2 class="eyebrow" style={{ margin: 0 }}>
                  Tus favoritos
                </h2>
                <a href={hrefFor({ name: 'favoritos' })} style={{ fontSize: '13.5px', fontWeight: 600 }}>
                  Ver todos
                </a>
              </div>
              <div class="strip">
                {favorites.map((product) => (
                  <a
                    key={product.id}
                    class="strip__item"
                    href={hrefFor({ name: 'producto', id: product.id })}
                  >
                    <img
                      class="strip__photo"
                      src={product.photos[0]?.thumbnail}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span class="strip__name">{product.name}</span>
                    <span class="strip__price num">{formatPrice(product.price.unit)}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {recents.length === 0 && favorites.length === 0 && (
            <p class="empty">
              Escribe al menos dos letras.
              <br />
              <span class="empty__hint">
                Funciona sin cobertura: el catálogo está en el móvil.
              </span>
            </p>
          )}

          <button class="footinfo" type="button" onClick={() => navigate({ name: 'ajustes' })}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconClock />
              Catálogo, copia de seguridad y apariencia
            </span>
          </button>
        </>
      ) : results.length === 0 ? (
        <p class="empty">Nada para «{query}».</p>
      ) : (
        <>
          <ul class="rows">
            {results.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                trailing={
                  <FavoriteButton
                    product={product}
                    saved={favIds.has(product.id)}
                    onToggled={(saved) => {
                      // Se pinta al momento y después se recarga la lista, que
                      // es lo que alimenta la tira de la portada.
                      setFavIds((prev) => {
                        const next = new Set(prev);
                        if (saved) next.add(product.id);
                        else next.delete(product.id);
                        return next;
                      });
                      void loadFavorites();
                    }}
                  />
                }
              />
            ))}
          </ul>
          {results.length === RESULT_LIMIT && (
            <p class="empty empty__hint">Hay más. Afina la búsqueda.</p>
          )}
        </>
      )}
    </div>
  );
}
