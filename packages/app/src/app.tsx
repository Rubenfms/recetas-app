import { useEffect, useState } from 'preact/hooks';
import { countProducts } from './db/catalog.js';
import { tabOf, useRoute } from './lib/router.js';
import { CategoryView } from './ui/CategoryView.js';
import { FavoritesView } from './ui/FavoritesView.js';
import { ProductView } from './ui/ProductView.js';
import { RecipeEditor } from './ui/RecipeEditor.js';
import { RecipesView } from './ui/RecipesView.js';
import { RecipeView } from './ui/RecipeView.js';
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
  const routeKey = 'id' in route ? `${route.name}:${String(route.id)}` : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  // El editor tapa la barra de pestañas con su propio pie.
  const showTabs = route.name !== 'receta-editar';

  return (
    <div class={showTabs ? 'shell' : 'shell shell--notabs'}>
      {route.name === 'buscar' && <SearchView key={catalogVersion} catalogSize={catalogSize} />}
      {route.name === 'producto' && <ProductView key={route.id} id={route.id} />}
      {route.name === 'categoria' && <CategoryView key={route.id} id={route.id} />}
      {route.name === 'favoritos' && <FavoritesView />}
      {route.name === 'recetas' && <RecipesView />}
      {route.name === 'receta' && <RecipeView key={route.id} id={route.id} />}
      {route.name === 'receta-editar' && (
        <RecipeEditor key={route.id ?? 'nueva'} id={route.id} initialProductId={route.productId} />
      )}
      {route.name === 'ajustes' && (
        <SettingsView onCatalogReplaced={() => setCatalogVersion((v) => v + 1)} />
      )}
      {showTabs && <TabBar active={tabOf(route)} />}
    </div>
  );
}
