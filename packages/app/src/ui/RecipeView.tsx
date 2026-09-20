import { useEffect, useState } from 'preact/hooks';
import { deleteRecipe, getRecipe, type Recipe } from '../db/user.js';
import { formatPrice } from '../lib/format.js';
import { computeRecipe, type RecipeComputed } from '../lib/recipe-lines.js';
import type { Macros } from '../lib/recipe-math.js';
import type { Quantity } from '../db/user.js';
import { goBack, hrefFor, navigate } from '../lib/router.js';
import { IconBack, IconBook, IconPlus } from './icons.js';
import { useObjectUrl } from './useObjectUrl.js';

const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const num0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export function formatQuantity(q: Quantity | null): string {
  if (!q) return '—';
  if (q.unit === 'ud') return `${num.format(q.amount)} ud.`;
  const big = q.amount >= 1000;
  if (q.unit === 'g') return big ? `${num.format(q.amount / 1000)} kg` : `${num0.format(q.amount)} g`;
  return big ? `${num.format(q.amount / 1000)} L` : `${num0.format(q.amount)} ml`;
}

function MacroTile({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  return (
    <div class="macro">
      <b class="num">{value == null ? '—' : `${num.format(value)} ${unit}`}</b>
      <span>{label}</span>
    </div>
  );
}

export function MacrosCard({
  macros,
  missing,
  title,
}: {
  macros: Macros;
  missing: number;
  title: string;
}) {
  return (
    <section class="card" style={{ marginTop: '14px' }}>
      <div class="card__head">
        <span class="card__title">{title}</span>
        <span class="num" style={{ fontSize: '13px', color: 'var(--muted)' }}>
          {num0.format(macros.kcal)} kcal
        </span>
      </div>
      <div class="macros">
        <MacroTile value={macros.protein_g} unit="g" label="proteínas" />
        <MacroTile value={macros.carbs_g} unit="g" label="hidratos" />
        <MacroTile value={macros.fat_g} unit="g" label="grasas" />
      </div>
      {missing > 0 ? (
        <p class="fuente" style={{ marginTop: '10px' }}>
          <i />
          {missing === 1 ? '1 ingrediente sin macros: el total es parcial' : `${missing} ingredientes sin macros: el total es parcial`}
        </p>
      ) : (
        <p class="fuente fuente--ok" style={{ marginTop: '10px' }}>
          <i />
          fuente: <strong>openfoodfacts</strong> · todos los ingredientes
        </p>
      )}
    </section>
  );
}

export function RecipeView({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [servings, setServings] = useState(1);
  const [computed, setComputed] = useState<RecipeComputed | null>(null);
  const photoUrl = useObjectUrl(recipe?.photo ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getRecipe(id);
      if (cancelled) return;
      setRecipe(found ?? null);
      if (found) setServings(found.servings);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    void computeRecipe(recipe, servings).then((c) => {
      if (!cancelled) setComputed(c);
    });
    return () => {
      cancelled = true;
    };
  }, [recipe, servings]);

  if (recipe === undefined) return <div class="empty">Cargando…</div>;
  if (recipe === null) return <p class="empty">Esa receta ya no existe.</p>;

  const totals = computed?.totals;
  const costKnown = totals ? totals.costMissing + totals.quantityMissing < recipe.ingredients.length : false;
  const thumbs = (computed?.lines ?? [])
    .map((l) => l.product?.photos[0])
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const onDelete = async (): Promise<void> => {
    if (!window.confirm(`¿Borrar «${recipe.name}»? No se puede deshacer.`)) return;
    await deleteRecipe(recipe.id);
    navigate({ name: 'recetas' });
  };

  return (
    <div class="page">
      <div class="hero">
        {photoUrl ? (
          <img class="hero__photo" src={photoUrl} alt={recipe.name} />
        ) : (
          <div class="hero__photo hero__photo--none" aria-hidden="true">
            <IconBook size={40} />
          </div>
        )}
        <div class="hero__bar">
          <button class="hero__btn" type="button" aria-label="Volver" onClick={() => goBack({ name: 'recetas' })}>
            <IconBack size={22} />
          </button>
          <a class="hero__btn hero__btn--text" href={hrefFor({ name: 'receta-editar', id: recipe.id })}>
            Editar
          </a>
        </div>
      </div>

      <div class="page__pad" style={{ paddingTop: '16px' }}>
        <h1 class="page__title serif" style={{ fontSize: '28px', lineHeight: 1.14 }}>
          {recipe.name || 'Sin nombre'}
        </h1>

        <div class="stepper" style={{ marginTop: '14px' }}>
          <button
            type="button"
            class="stepper__btn"
            aria-label="Una ración menos"
            disabled={servings <= 1}
            onClick={() => setServings((s) => Math.max(1, s - 1))}
          >
            −
          </button>
          <span class="stepper__value num">
            {servings} {servings === 1 ? 'ración' : 'raciones'}
          </span>
          <button
            type="button"
            class="stepper__btn"
            aria-label="Una ración más"
            onClick={() => setServings((s) => s + 1)}
          >
            <IconPlus size={16} />
          </button>
          {servings !== recipe.servings && (
            <span class="stepper__hint">
              cantidades ajustadas (la receta es para {recipe.servings})
            </span>
          )}
        </div>

        {thumbs.length > 0 && (
          <div class="photostrip">
            {thumbs.map((p) => (
              <img key={p.regular} src={p.thumbnail} alt="" loading="lazy" decoding="async" />
            ))}
          </div>
        )}

        {totals && costKnown && (
          <section class="costcard">
            <div>
              <div class="costcard__main num">
                {formatPrice(totals.perServing.cost)} <span>por ración</span>
              </div>
              <div class="costcard__sub num">
                {formatPrice(totals.cost)} la receta entera
                {totals.costMissing > 0 &&
                  ` · ${totals.costMissing} sin precio, es aproximado`}
              </div>
            </div>
          </section>
        )}

        {totals && totals.macrosMissing + totals.quantityMissing < recipe.ingredients.length && (
          <MacrosCard
            macros={totals.perServing.macros}
            missing={totals.macrosMissing + totals.quantityMissing}
            title="Por ración"
          />
        )}

        <h2 class="eyebrow" style={{ margin: '24px 0 6px' }}>
          Ingredientes
        </h2>
        <ul class="ings">
          {(computed?.lines ?? []).map((line, i) => {
            const product = line.product;
            const photo = product?.photos[0]?.thumbnail;
            const inner = (
              <>
                {photo ? (
                  <img class="ings__thumb" src={photo} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span class="ings__thumb ings__thumb--none" aria-hidden="true" />
                )}
                <span class="ings__body">
                  <span class="ings__name">{product?.name ?? line.ingredient.label}</span>
                  {!product && line.ingredient.productId && (
                    <span class="ings__meta">ya no está en el catálogo</span>
                  )}
                  {line.missing.includes('macros') && product && (
                    <span class="ings__meta">sin macros</span>
                  )}
                </span>
                <span class="ings__right">
                  <b class="num">{formatQuantity(line.quantity)}</b>
                  <span class="num">{line.cost === null ? 'sin precio' : formatPrice(line.cost)}</span>
                </span>
              </>
            );
            return (
              <li key={i} class="ings__row">
                {product ? (
                  <a class="ings__link" href={hrefFor({ name: 'producto', id: product.id })}>
                    {inner}
                  </a>
                ) : (
                  <div class="ings__link">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>

        {recipe.notes && (
          <>
            <h2 class="eyebrow" style={{ margin: '24px 0 6px' }}>
              Notas
            </h2>
            <p style={{ margin: 0, whiteSpace: 'pre-line', fontSize: '14.5px' }}>{recipe.notes}</p>
          </>
        )}

        <button
          type="button"
          class="btn btn--full"
          style={{ marginTop: '32px', color: 'var(--warn-ink)' }}
          onClick={() => void onDelete()}
        >
          Borrar receta
        </button>
      </div>
    </div>
  );
}
