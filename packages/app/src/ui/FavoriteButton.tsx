import type { StoredProduct } from '../db/catalog.js';
import { toggleFavorite } from '../db/user.js';
import { IconHeart } from './icons.js';

/**
 * Corazón para guardar sin salir del listado. Se usa en los resultados de
 * búsqueda y en la lista de favoritos, así que el estado lo lleva quien
 * llama: es el único que sabe cómo refrescar su propia lista.
 */
export function FavoriteButton({
  product,
  saved,
  onToggled,
  size = 21,
}: {
  product: StoredProduct;
  saved: boolean;
  onToggled: (saved: boolean) => void;
  size?: number;
}) {
  return (
    <button
      class={saved ? 'iconbtn iconbtn--on' : 'iconbtn'}
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Quitar ${product.name} de favoritos` : `Guardar ${product.name}`}
      style={{ marginRight: '6px' }}
      onClick={(e) => {
        // El botón vive dentro de una fila que es un enlace a la ficha.
        e.preventDefault();
        e.stopPropagation();
        void toggleFavorite(product.id, product.ean).then(onToggled);
      }}
    >
      <IconHeart filled={saved} size={size} />
    </button>
  );
}
