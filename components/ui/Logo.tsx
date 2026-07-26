export function Logo({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const tile =
    size === 'md'
      ? 'h-9 w-9 rounded-xl text-lg'
      : 'h-[30px] w-[30px] rounded-[11px] text-base';
  const word = size === 'md' ? 'text-[22px]' : 'text-[19px]';
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex -rotate-6 items-center justify-center bg-tomato font-display font-extrabold text-white ${tile}`}
      >
        e
      </span>
      <span className={`font-display font-extrabold tracking-tight ${word}`}>EatFit</span>
    </span>
  );
}
