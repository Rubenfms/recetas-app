import { hrefFor, type TabName } from '../lib/router.js';
import { IconBook, IconHeart, IconSearch } from './icons.js';

const TABS: { name: TabName; label: string }[] = [
  { name: 'buscar', label: 'Buscar' },
  { name: 'favoritos', label: 'Favoritos' },
  { name: 'recetas', label: 'Recetas' },
];

export function TabBar({ active }: { active: TabName }) {
  return (
    <nav class="tabs" aria-label="Secciones">
      {TABS.map((tab) => {
        const on = tab.name === active;
        return (
          <a
            key={tab.name}
            class={on ? 'tab tab--on' : 'tab'}
            href={hrefFor(tab.name === 'buscar' ? { name: 'buscar' } : { name: tab.name })}
            aria-current={on ? 'page' : undefined}
          >
            {tab.name === 'buscar' && <IconSearch />}
            {tab.name === 'favoritos' && <IconHeart filled={on} />}
            {tab.name === 'recetas' && <IconBook />}
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
