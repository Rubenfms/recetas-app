import type { CatalogProduct, FuenteNutricional, NetContent } from '@recetas/shared';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export function formatPrice(value: number | null): string {
  return value === null ? '—' : eur.format(value);
}

/** 950 g → "950 g"; 1050 g → "1,05 kg"; 330 ml → "330 ml"; 1500 ml → "1,5 L". */
export function formatNetContent(content: NetContent | null): string {
  if (!content) return '—';
  const { amount, unit } = content;
  if (unit === 'g') {
    return amount >= 1000 ? `${num.format(amount / 1000)} kg` : `${num.format(amount)} g`;
  }
  return amount >= 1000 ? `${num.format(amount / 1000)} L` : `${num.format(amount)} ml`;
}

export function formatReferencePrice(product: CatalogProduct): string {
  const { reference, referenceFormat } = product.price;
  if (reference === null || !referenceFormat) return '';
  return `${eur.format(reference)}/${referenceFormat}`;
}

/**
 * Cómo se vende, con las rarezas del catálogo hechas explícitas en vez de
 * escondidas: packs, peso aproximado, granel y peso escurrido.
 */
export function describePackaging(product: CatalogProduct): string {
  const parts: string[] = [];
  const { rawSize, packaging, netContent } = product;

  if (packaging) parts.push(packaging);

  const size = formatNetContent(netContent);
  if (size !== '—') {
    parts.push(rawSize.approxSize ? `~${size}` : size);
  } else if (rawSize.unitSize && rawSize.sizeFormat === 'ud') {
    parts.push(`${num.format(rawSize.unitSize)} ud.`);
  }

  if (rawSize.isPack && rawSize.totalUnits) {
    parts.push(`pack de ${rawSize.totalUnits}${rawSize.unitName ? ` ${rawSize.unitName}` : ''}`);
  }
  if (rawSize.drainedWeight) {
    parts.push(`${formatNetContent({ amount: rawSize.drainedWeight * 1000, unit: 'g' })} escurrido`);
  }
  if (rawSize.isVariableWeight || rawSize.isBulk) parts.push('peso variable');

  return parts.join(' · ');
}

const FUENTE_LABEL: Record<FuenteNutricional, string> = {
  mercadona: 'ficha de Mercadona',
  openfoodfacts: 'Open Food Facts',
  generico: 'estimado de un genérico',
  manual: 'introducido por mí',
};

export function describeFuente(fuente: FuenteNutricional): string {
  return FUENTE_LABEL[fuente];
}

/**
 * Los ingredientes y alérgenos vienen con HTML de Mercadona, y el `<strong>`
 * es información: marca los alérgenos. Se conserva escapando TODO y
 * devolviendo después solo las etiquetas de la lista blanca, que por
 * construcción no pueden llevar atributos.
 */
export function renderMarkedText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;(\/?)(strong|b|em|i|p|br)\s*\/?&gt;/gi, '<$1$2>');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${num.format(bytes / (1024 * 1024))} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-ES');
}
