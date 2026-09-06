import type { StoredProduct } from '../db/catalog.js';
import { describePackaging, formatPrice, formatReferencePrice } from '../lib/format.js';
import { hrefFor } from '../lib/router.js';

/** Fila de producto compartida por la búsqueda y por favoritos. */
export function ProductRow({
  product,
  badge,
  trailing,
}: {
  product: StoredProduct;
  badge?: string;
  trailing?: preact.ComponentChildren;
}) {
  const reference = formatReferencePrice(product);
  const photo = product.photos[0]?.thumbnail;

  return (
    <li class="row">
      <a class="row__link" href={hrefFor({ name: 'producto', id: product.id })}>
        {photo ? (
          <img class="thumb" src={photo} alt="" loading="lazy" decoding="async" width={60} height={60} />
        ) : (
          <span class="thumb" aria-hidden="true" />
        )}
        <span class="row__body">
          <span class="row__name">{product.name}</span>
          <span class="row__meta">{describePackaging(product) || '—'}</span>
          {badge && <span class="badge">{badge}</span>}
        </span>
        <span class="row__price num">
          <b>{formatPrice(product.price.unit)}</b>
          {reference && <span>{reference}</span>}
        </span>
      </a>
      {trailing}
    </li>
  );
}
