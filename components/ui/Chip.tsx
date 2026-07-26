'use client';

export function Chip({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const base =
    'inline-flex items-center rounded-full border-2 border-ink px-3.5 py-1.5 text-sm transition-colors';
  const look = selected
    ? 'bg-peach font-bold text-tomato'
    : 'bg-white font-semibold text-ink' + (interactive ? ' hover:bg-cream' : '');
  if (!interactive) {
    return <span className={`${base} ${look}`}>{label}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`${base} ${look} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato`}
    >
      {label}
    </button>
  );
}
