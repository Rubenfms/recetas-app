/** Iconos de trazo, rejilla de 24, dibujados a mano para que escalen y recoloreen. */

interface IconProps {
  size?: number;
  filled?: boolean;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
  'aria-hidden': true,
};

export function IconSearch({ size = 22 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}

export function IconHeart({ size = 22, filled = false }: IconProps) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      stroke-width="1.8"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
    >
      <path d="M12 20.4S3.6 15.1 3.6 9.4A4.85 4.85 0 0 1 12 6.3a4.85 4.85 0 0 1 8.4 3.1c0 5.7-8.4 11-8.4 11z" />
    </svg>
  );
}

export function IconBook({ size = 22 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.8">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
    </svg>
  );
}

export function IconBack({ size = 23 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.9">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevron({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.8">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconPlus({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClock({ size = 16 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.7">
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconShare({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.8">
      <path d="M12 15V4" />
      <path d="M8.5 7.5L12 4l3.5 3.5" />
      <path d="M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  );
}

export function IconUpload({ size = 18 }: IconProps) {
  return (
    <svg {...base} width={size} height={size} stroke-width="1.8">
      <path d="M12 4v11" />
      <path d="M8.5 11.5L12 15l3.5-3.5" />
      <path d="M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  );
}
