import { useEffect, useState } from 'preact/hooks';
import { getProducts } from '../db/catalog.js';
import { listRecipes, type Recipe } from '../db/user.js';
import { formatPrice } from '../lib/format.js';
import { computeRecipe } from '../lib/recipe-lines.js';
import { hrefFor } from '../lib/router.js';
import { IconBook, IconPlus } from './icons.js';
import { useObjectUrl } from './useObjectUrl.js';

interface CardData {
  recipe: Recipe;
  costPerServing: number | null;
  costMissing: number;
  thumbs: string[];
}

function RecipeCard({ data }: { data: CardData }) {
  const { recipe, costPerServing, costMissing, thumbs } = data;
  const photoUrl = useObjectUrl(recipe.photo);
  const extra = recipe.ingredients.length - thumbs.length;

  return (
    <li class="rcard">
      <a class="rcard__link" href={hrefFor({ name: 'receta', id: recipe.id })}>
        {photoUrl ? (
          <img class="rcard__photo" src={photoUrl} alt="" />
        ) : (
          <div class="rcard__photo rcard__photo--none" aria-hidden="true">
            <IconBook size={30} />
          </div>
        )}
        <div class="rcard__body">
          <h2 class="rcard__name serif">{recipe.name || 'Sin nombre'}</h2>
          <p class="rcard__meta">
            {recipe.servings} {recipe.servings === 1 ? 'ración' : 'raciones'} ·{' '}
            {recipe.ingredients.length}{' '}
            {recipe.ingredients.length === 1 ? 'ingrediente' : 'ingredientes'}
          </p>
          <div class="rcard__foot">
            <div class="thumbs">
              {thumbs.map((src) => (
                <img key={src} src={src} alt="" loading="lazy" decoding="async" />
              ))}
              {extra > 0 && <span>+{extra}</span>}
            </div>
            {costPerServing !== null && (
              <div class="rcard__cost num">
                <b>{formatPrice(costPerServing)}</b>
                <span>/ración{costMissing > 0 ? ' · aprox.' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </a>
    </li>
  );
}

export function RecipesView() {
  const [cards, setCards] = useState<CardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recipes = await listRecipes();
      const data: CardData[] = [];
      for (const recipe of recipes) {
        const { totals } = await computeRecipe(recipe);
        const ids = recipe.ingredients
          .map((i) => i.productId)
          .filter((id): id is string => Boolean(id))
          .slice(0, 4);
        const products = await getProducts(ids);
        const thumbs = products
          .map((p) => p?.photos[0]?.thumbnail)
          .filter((u): u is string => Boolean(u));
        const hasAnyCost = totals.costMissing + totals.quantityMissing < recipe.ingredients.length;
        data.push({
          recipe,
          costPerServing: hasAnyCost ? totals.perServing.cost : null,
          costMissing: totals.costMissing + totals.quantityMissing,
          thumbs,
        });
      }
      if (!cancelled) setCards(data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (cards === null) return <div class="empty">Cargando…</div>;

  const totalIngredients = cards.reduce((n, c) => n + c.recipe.ingredients.length, 0);

  return (
    <div class="page">
      <div class="page__head">
        <div class="section-head" style={{ padding: 0, marginBottom: 0 }}>
          <h1 class="page__title serif">Recetas</h1>
          <a class="btn btn--primary btn--pill" href={hrefFor({ name: 'receta-editar', id: null })}>
            <IconPlus size={17} />
            Nueva
          </a>
        </div>
        <p class="page__sub">
          {cards.length === 0
            ? 'Todavía no tienes ninguna'
            : `${cards.length} ${cards.length === 1 ? 'receta' : 'recetas'} · ${totalIngredients} ingredientes en total`}
        </p>
      </div>

      {cards.length === 0 ? (
        <div class="empty">
          <span style={{ display: 'inline-flex', color: 'var(--muted)' }}>
            <IconBook size={34} />
          </span>
          <p style={{ margin: '14px 0 0' }}>Una receta son productos del catálogo con sus cantidades.</p>
          <p class="empty__hint" style={{ margin: '6px 0 0' }}>
            Te dirá lo que cuesta y las kcal por ración, y en el súper verás las fotos
            de todo lo que lleva.
          </p>
        </div>
      ) : (
        <ul class="rcards">
          {cards.map((c) => (
            <RecipeCard key={c.recipe.id} data={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
