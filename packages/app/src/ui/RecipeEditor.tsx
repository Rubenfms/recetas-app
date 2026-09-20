import { useEffect, useRef, useState } from 'preact/hooks';
import { getProducts, searchProducts, type StoredProduct } from '../db/catalog.js';
import {
  getRecipe,
  newId,
  saveRecipe,
  type Quantity,
  type QuantityUnit,
  type Recipe,
  type RecipeIngredient,
} from '../db/user.js';
import { formatPrice } from '../lib/format.js';
import { processPhoto } from '../lib/photo.js';
import { precachePhotos } from '../lib/precache.js';
import { computeLine, computeTotals, defaultQuantity } from '../lib/recipe-math.js';
import { goBack, replace } from '../lib/router.js';
import { IconCamera, IconClose, IconImage, IconPlus, IconSearch } from './icons.js';
import { useObjectUrl } from './useObjectUrl.js';

const UNITS: { value: QuantityUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'ud', label: 'ud.' },
];

function blank(): Recipe {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name: '',
    servings: 2,
    ingredients: [],
    steps: [],
    notes: null,
    photo: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Editor de receta. `id` nulo = nueva. */
export function RecipeEditor({ id, initialProductId }: { id: string | null; initialProductId?: string }) {
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [products, setProducts] = useState<Map<string, StoredProduct>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StoredProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const photoUrl = useObjectUrl(draft?.photo ?? null);

  // Carga la receta (o una en blanco) y los productos de sus ingredientes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recipe = id ? ((await getRecipe(id)) ?? blank()) : blank();
      const ids = recipe.ingredients.map((i) => i.productId).filter((x): x is string => Boolean(x));
      if (initialProductId && !ids.includes(initialProductId)) ids.push(initialProductId);
      const found = await getProducts(ids);
      if (cancelled) return;
      const map = new Map<string, StoredProduct>();
      found.forEach((p) => p && map.set(p.id, p));
      setProducts(map);

      // Venimos de "A una receta" en la ficha de un producto: entra ya puesto.
      const initial = initialProductId ? map.get(initialProductId) : undefined;
      if (initial && !recipe.ingredients.some((i) => i.productId === initial.id)) {
        recipe.ingredients = [...recipe.ingredients, toIngredient(initial)];
      }
      setDraft(recipe);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, initialProductId]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    void searchProducts(query, { limit: 12 }).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!draft) return <div class="empty">Cargando…</div>;

  const update = (patch: Partial<Recipe>): void => setDraft({ ...draft, ...patch });

  const setIngredient = (index: number, patch: Partial<RecipeIngredient>): void => {
    const next = draft.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing));
    update({ ingredients: next });
  };

  const addProduct = (product: StoredProduct): void => {
    if (draft.ingredients.some((i) => i.productId === product.id)) return;
    setProducts(new Map(products).set(product.id, product));
    update({ ingredients: [...draft.ingredients, toIngredient(product)] });
    setQuery('');
    setSearching(false);
  };

  const onPhoto = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy('foto');
    setError(null);
    try {
      const photo = await processPhoto(file);
      // Funcional: mientras la foto se procesaba has podido escribir el nombre.
      setDraft((d) => d && { ...d, photo });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar esa foto.');
    } finally {
      setBusy(null);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const onSave = async (): Promise<void> => {
    const name = draft.name.trim();
    if (!name) {
      setError('Ponle un nombre a la receta.');
      return;
    }
    setBusy('guardar');
    try {
      await saveRecipe({ ...draft, name });
      // Que la receta se vea entera en el súper aunque no hayas abierto
      // nunca esas fichas: sus fotos se piden ahora, con cobertura.
      void precachePhotos(draft.ingredients.map((i) => (i.productId ? products.get(i.productId) : undefined)));
      replace({ name: 'receta', id: draft.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(null);
    }
  };

  const lines = draft.ingredients.map((ing) =>
    computeLine(ing, ing.productId ? (products.get(ing.productId) ?? null) : null),
  );
  const totals = computeTotals(lines, draft.servings);
  const costKnown = totals.costMissing + totals.quantityMissing < draft.ingredients.length;

  return (
    <div class="page editor">
      <div class="editor__bar">
        <button type="button" class="editor__barbtn" onClick={() => goBack({ name: 'recetas' })}>
          Cancelar
        </button>
        <span class="editor__title">{id ? 'Editar receta' : 'Nueva receta'}</span>
        <button
          type="button"
          class="editor__barbtn editor__barbtn--primary"
          disabled={busy !== null}
          onClick={() => void onSave()}
        >
          {busy === 'guardar' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div class="page__pad">
        {error && (
          <p class="notice notice--warn" style={{ margin: '0 0 14px' }}>
            {error}
          </p>
        )}

        {/* Dos inputs a propósito: en iOS, `capture` fuerza la cámara y
            esconde la galería. El de galería va sin él. */}
        <input
          ref={galleryRef}
          class="sr-only"
          type="file"
          accept="image/*"
          onChange={(e) => void onPhoto((e.target as HTMLInputElement).files?.[0])}
        />
        <input
          ref={cameraRef}
          class="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void onPhoto((e.target as HTMLInputElement).files?.[0])}
        />

        {photoUrl ? (
          <div class="photopick photopick--filled">
            <img src={photoUrl} alt="" />
            <div class="photopick__actions">
              <button type="button" class="btn" onClick={() => galleryRef.current?.click()}>
                Cambiar
              </button>
              <button type="button" class="btn" onClick={() => update({ photo: null })}>
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <div class="photopick">
            <div class="photopick__label">
              <IconImage size={20} />
              Foto de la receta
            </div>
            <div class="photopick__actions">
              <button
                type="button"
                class="btn"
                disabled={busy === 'foto'}
                onClick={() => galleryRef.current?.click()}
              >
                <IconImage size={18} />
                Galería
              </button>
              <button
                type="button"
                class="btn"
                disabled={busy === 'foto'}
                onClick={() => cameraRef.current?.click()}
              >
                <IconCamera size={18} />
                Cámara
              </button>
            </div>
            <span class="photopick__hint">
              {busy === 'foto' ? 'Preparando la foto…' : 'se guarda solo en tu móvil, no sale de ahí'}
            </span>
          </div>
        )}

        <label class="field">
          <span class="eyebrow">Nombre</span>
          <input
            class="field__input serif"
            type="text"
            value={draft.name}
            placeholder="Tortilla de patatas"
            autocapitalize="sentences"
            onInput={(e) => update({ name: (e.target as HTMLInputElement).value })}
          />
        </label>

        {/* Actualización funcional: dos toques rápidos en el mismo frame deben
            contar como dos, no leer los dos el mismo valor. */}
        <div class="field field--row">
          <span style={{ fontSize: '14.5px' }}>Raciones</span>
          <div class="stepper">
            <button
              type="button"
              class="stepper__btn"
              aria-label="Una ración menos"
              disabled={draft.servings <= 1}
              onClick={() => setDraft((d) => d && { ...d, servings: Math.max(1, d.servings - 1) })}
            >
              −
            </button>
            <span class="stepper__value num" style={{ minWidth: '28px' }}>
              {draft.servings}
            </span>
            <button
              type="button"
              class="stepper__btn"
              aria-label="Una ración más"
              onClick={() => setDraft((d) => d && { ...d, servings: d.servings + 1 })}
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>

        <div class="section-head" style={{ padding: 0, margin: '24px 0 8px' }}>
          <h2 class="eyebrow" style={{ margin: 0 }}>
            Ingredientes
          </h2>
          <span class="num" style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
            {draft.ingredients.length}
          </span>
        </div>

        <div class="ingedit">
          {lines.map((line, index) => {
            const product = line.product;
            const q = line.ingredient.quantity;
            return (
              <div key={index} class="ingedit__row">
                {product?.photos[0]?.thumbnail ? (
                  <img class="ingedit__thumb" src={product.photos[0].thumbnail} alt="" />
                ) : (
                  <span class="ingedit__thumb ingedit__thumb--none" aria-hidden="true" />
                )}
                <div class="ingedit__body">
                  <div class="ingedit__name">{product?.name ?? line.ingredient.label}</div>
                  <div class="ingedit__meta num">
                    {product
                      ? line.cost === null
                        ? product.price.reference != null && product.price.referenceFormat
                          ? `${formatPrice(product.price.reference)}/${product.price.referenceFormat} · sin coste para esa unidad`
                          : 'sin precio de referencia'
                        : `${formatPrice(line.cost)}${line.missing.includes('macros') ? ' · sin macros' : ''}`
                      : 'ya no está en el catálogo'}
                  </div>
                </div>
                <div class="qty">
                  <input
                    class="qty__amount num"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={q?.amount ?? ''}
                    aria-label="Cantidad"
                    onInput={(e) => {
                      const raw = (e.target as HTMLInputElement).value;
                      const amount = raw === '' ? NaN : Number(raw);
                      const unit = q?.unit ?? (product ? defaultQuantity(product).unit : 'g');
                      setIngredient(index, {
                        quantity: Number.isFinite(amount) && amount >= 0 ? { amount, unit } : null,
                      });
                    }}
                  />
                  <select
                    class="qty__unit"
                    value={q?.unit ?? 'g'}
                    aria-label="Unidad"
                    onChange={(e) => {
                      const unit = (e.target as HTMLSelectElement).value as QuantityUnit;
                      setIngredient(index, { quantity: { amount: q?.amount ?? 0, unit } as Quantity });
                    }}
                  >
                    {UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  class="ingedit__remove"
                  aria-label={`Quitar ${product?.name ?? line.ingredient.label}`}
                  onClick={() =>
                    update({ ingredients: draft.ingredients.filter((_, i) => i !== index) })
                  }
                >
                  <IconClose size={16} />
                </button>
              </div>
            );
          })}

          {searching ? (
            <div class="ingedit__search">
              <div class="search">
                <IconSearch size={20} />
                <input
                  ref={searchRef}
                  class="search__input"
                  type="search"
                  value={query}
                  placeholder="Buscar producto"
                  autocomplete="off"
                  autocapitalize="off"
                  enterkeyhint="search"
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                />
                <button
                  class="search__clear"
                  type="button"
                  aria-label="Cerrar la búsqueda"
                  onClick={() => {
                    setSearching(false);
                    setQuery('');
                  }}
                >
                  <IconClose />
                </button>
              </div>
              {results.length > 0 && (
                <ul class="rows rows--compact" style={{ marginTop: '6px' }}>
                  {results.map((p) => (
                    <li key={p.id} class="row">
                      <button type="button" class="row__link" onClick={() => addProduct(p)}>
                        <img class="thumb thumb--sm" src={p.photos[0]?.thumbnail} alt="" loading="lazy" />
                        <span class="row__body">
                          <span class="row__name">{p.name}</span>
                          <span class="row__meta">
                            {p.price.reference != null && p.price.referenceFormat
                              ? `${formatPrice(p.price.reference)}/${p.price.referenceFormat}`
                              : formatPrice(p.price.unit)}
                            {p.nutrition?.kcal != null && ` · ${Math.round(p.nutrition.kcal)} kcal/100`}
                          </span>
                        </span>
                        <span style={{ color: 'var(--accent)', display: 'flex' }}>
                          <IconPlus />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              type="button"
              class="ingedit__add"
              onClick={() => {
                setSearching(true);
                setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              <IconSearch size={19} />
              Buscar otro producto
            </button>
          )}
        </div>

        <label class="field" style={{ marginTop: '22px' }}>
          <span class="eyebrow">Notas</span>
          <textarea
            class="field__input"
            rows={3}
            value={draft.notes ?? ''}
            placeholder="Lo que quieras recordar"
            onInput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value || null })}
          />
        </label>
      </div>

      <div class="editor__foot">
        <div>
          <div class="num" style={{ fontSize: '17px', fontWeight: 650 }}>
            {costKnown ? formatPrice(totals.cost) : '—'}
          </div>
          <div class="num" style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {costKnown
              ? `${formatPrice(totals.perServing.cost)} por ración${totals.costMissing + totals.quantityMissing > 0 ? ' · aprox.' : ''}`
              : 'añade ingredientes con cantidad'}
          </div>
        </div>
        <span class="num" style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
          {Math.round(totals.perServing.macros.kcal)} kcal/ración
          {totals.macrosMissing + totals.quantityMissing > 0 && ' · parcial'}
        </span>
      </div>
    </div>
  );
}

function toIngredient(product: StoredProduct): RecipeIngredient {
  return {
    productId: product.id,
    ean: product.ean,
    label: product.name,
    quantity: defaultQuantity(product),
  };
}
