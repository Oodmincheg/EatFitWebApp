// Number fields are typed by hand in a locale that writes 1,5 for one and a
// half, so "1,5" and "1.5" both read as 1.5; anything else is 0.
export function num(s: string): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Blank stays undefined, so an optional field left empty is stored as absent
// rather than as a zero the user never typed.
export function optNum(s: string): number | undefined {
  return s.trim() === '' ? undefined : num(s);
}
