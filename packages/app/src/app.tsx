import { useEffect, useState } from 'preact/hooks';
import { countProducts } from './db/catalog.js';
import { tabOf, useRoute } from './lib/router.js';
import { FavoritesView } from './ui/FavoritesView.js';
import { ProductView } from './ui/ProductView.js';
import { RecipesView } from './ui/RecipesView.js';
import { SearchView } from './ui/SearchView.js';
import { SettingsView } from './ui/SettingsView.js';
import { TabBar } from './ui/TabBar.js';

export function App() {
  const route = useRoute();
  const [catalogSize, setCatalogSize] = useState(0);
  /** Cambia al reemplazar el catálogo, para remontar las vistas que lo leen. */
  const [catalogVersion, setCatalogVersion] = useState(0);

  useEffect(() => {
    void countProducts().then(setCatalogSize);
  }, [catalogVersion]);

  // Cada cambio de ruta empieza arriba: es lo que hace una app nativa y evita
  // aterrizar a media ficha por venir de un listado desplazado.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, route.name === 'producto' ? route.id : '']);

  return (
    <div class="shell">
      {route.name === 'buscar' && <SearchView key={catalogVersion} catalogSize={catalogSize} />}
      {route.name === 'producto' && <ProductView key={route.id} id={route.id} />}
      {route.name === 'favoritos' && <FavoritesView />}
      {route.name === 'recetas' && <RecipesView />}
      {route.name === 'ajustes' && (
        <SettingsView onCatalogReplaced={() => setCatalogVersion((v) => v + 1)} />
      )}
      <TabBar active={tabOf(route)} />
    </div>
  );
}
