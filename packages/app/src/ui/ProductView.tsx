import { useEffect, useState } from 'preact/hooks';
import { getCategories, getProduct, type StoredProduct } from '../db/catalog.js';
import { getNutritionOverride, isFavorite, toggleFavorite } from '../db/user.js';
import {
  describeFuente,
  describePackaging,
  formatNetContent,
  formatPrice,
  formatReferencePrice,
  renderMarkedText,
} from '../lib/format.js';
import { goBack } from '../lib/router.js';
import { IconBack, IconChevron, IconHeart, IconPlus } from './icons.js';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * RESTRICCIÓN DURA: se enseña siempre de dónde salen los macros. Cuando no hay
 * datos también se dice por qué, para no dejar la duda de si es un fallo.
 */
function Nutrition({ product, manual }: { product: StoredProduct; manual: boolean }) {
  const nutrition = product.nutrition;

  if (!nutrition && !manual) {
    return (
      <section class="card card--warn" style={{ marginTop: '20px' }}>
        <div class="card__head">
          <span class="card__title">Valores nutricionales</span>
          <span style={{ fontSize: '13px', color: 'var(--warn-ink)' }}>Sin datos</span>
        </div>
        <p class="card__note">
          Mercadona no publica kcal ni macros: solo ingredientes y alérgenos. Se rellenan
          cruzando el EAN con Open Food Facts.
        </p>
        <p class="fuente">
          <i />
          fuente —
        </p>
      </section>
    );
  }

  const fuente = manual ? 'manual' : (nutrition?.fuente ?? 'generico');
  const per = nutrition?.per === '100ml' ? '100 ml' : '100 g';
  const rows: [string, number | null | undefined, string][] = [
    ['Energía', nutrition?.kcal, 'kcal'],
    ['Proteínas', nutrition?.protein_g, 'g'],
    ['Hidratos', nutrition?.carbs_g, 'g'],
    ['de los cuales azúcares', nutrition?.sugars_g, 'g'],
    ['Grasas', nutrition?.fat_g, 'g'],
    ['de las cuales saturadas', nutrition?.saturates_g, 'g'],
    ['Fibra', nutrition?.fiber_g, 'g'],
    ['Sal', nutrition?.salt_g, 'g'],
  ];

  return (
    <section class="card" style={{ marginTop: '20px' }}>
      <div class="card__head">
        <span class="card__title">Valores nutricionales</span>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>por {per}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
        <tbody>
          {rows.map(([label, value, unit]) => (
            <tr key={label}>
              <th
                style={{
                  textAlign: 'left',
                  fontWeight: 'normal',
                  color: 'var(--muted)',
                  padding: '3px 0',
                  fontSize: '14px',
                }}
              >
                {label}
              </th>
              <td class="num" style={{ textAlign: 'right', fontSize: '14px' }}>
                {value == null ? '—' : `${value} ${unit}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="fuente fuente--ok">
        <i />
        fuente: <strong>{fuente}</strong> · {describeFuente(fuente)}
      </p>
    </section>
  );
}

function Disclosure({ title, html }: { title: string; html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button class="disclose" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', display: 'flex' }}>
          <IconChevron />
        </span>
      </button>
      {open && (
        <div class="disclose__body" dangerouslySetInnerHTML={{ __html: renderMarkedText(html) }} />
      )}
    </>
  );
}

export function ProductView({ id }: { id: string }) {
  const [product, setProduct] = useState<StoredProduct | null | undefined>(undefined);
  const [path, setPath] = useState<string>('');
  const [fav, setFav] = useState(false);
  const [manual, setManual] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getProduct(id);
      if (cancelled) return;
      setProduct(found ?? null);
      setPhotoIndex(0);
      if (!found) return;

      const [categories, favorite, override] = await Promise.all([
        getCategories(),
        isFavorite(found.id),
        getNutritionOverride(found.id),
      ]);
      if (cancelled) return;
      const names = new Map(categories.map((c) => [c.id, c.name]));
      setPath(
        found.categoryPath
          .map((cid) => names.get(cid))
          .filter((n): n is string => Boolean(n))
          .join(' › '),
      );
      setFav(favorite);
      setManual(Boolean(override));
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (product === undefined) return <div class="empty">Cargando…</div>;
  if (product === null) {
    return <p class="empty">Ese producto no está en el catálogo descargado.</p>;
  }

  const photo = product.photos[photoIndex] ?? product.photos[0];
  const reference = formatReferencePrice(product);

  return (
    <div class="page">
      <div class="detail__bar">
        <button
          class="iconbtn"
          type="button"
          aria-label="Volver"
          onClick={() => goBack({ name: 'buscar' })}
        >
          <IconBack />
        </button>
        <button
          class={fav ? 'iconbtn iconbtn--on' : 'iconbtn'}
          type="button"
          aria-pressed={fav}
          aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          onClick={() => {
            void toggleFavorite(product.id, product.ean).then(setFav);
          }}
        >
          <IconHeart filled={fav} size={23} />
        </button>
      </div>

      <div class="page__pad">
        {photo && (
          <>
            <div class="photo">
              <img src={photo.regular} alt={product.name} decoding="async" />
            </div>
            {product.photos.length > 1 && (
              <div class="dots">
                {product.photos.map((p, i) => (
                  <button
                    key={p.regular}
                    class={i === photoIndex ? 'on' : undefined}
                    type="button"
                    aria-label={`Foto ${i + 1}`}
                    onClick={() => setPhotoIndex(i)}
                    style={{
                      border: 0,
                      padding: 0,
                      width: '18px',
                      height: '18px',
                      background: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <i
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background: i === photoIndex ? 'var(--accent)' : 'var(--line)',
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <h1 class="detail__name serif">{product.name}</h1>
        {product.brand && <div class="pill">{product.brand}</div>}

        <div class="price num">
          <b>{formatPrice(product.price.unit)}</b>
          {reference && <span>{reference}</span>}
        </div>

        <dl class="facts">
          <Fact label="Formato" value={describePackaging(product) || '—'} />
          <Fact label="Contenido" value={formatNetContent(product.netContent)} />
          <Fact label="EAN" value={product.ean ?? 'sin EAN'} />
          <Fact label="Id Mercadona" value={product.id} />
          {product.origin && <Fact label="Origen" value={product.origin} />}
          {path && <Fact label="Categoría" value={path} />}
        </dl>

        <Nutrition product={product} manual={manual} />

        <div class="btnrow">
          <button
            class={fav ? 'btn btn--primary' : 'btn'}
            type="button"
            onClick={() => {
              void toggleFavorite(product.id, product.ean).then(setFav);
            }}
          >
            <IconHeart size={18} filled={fav} />
            {fav ? 'Guardado' : 'Guardar'}
          </button>
          <button class="btn" type="button" disabled title="Llega con las recetas">
            <IconPlus />
            A una receta
          </button>
        </div>

        <div style={{ marginTop: '22px', borderTop: '1px solid var(--line)' }}>
          {product.ingredients && <Disclosure title="Ingredientes" html={product.ingredients} />}
          {product.allergens && <Disclosure title="Alérgenos" html={product.allergens} />}
        </div>
      </div>
    </div>
  );
}
