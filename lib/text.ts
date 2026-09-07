// Ukrainian plural forms: 1 позиція, 2 позиції, 5 позицій (also 21, 22, 25).
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
