import { pantryGrams, type PantryItem, type PantryUnit } from './schemas';

// Shared by the pantry page and the pre-generation dialog: both add items by
// name, and neither may create duplicates or lose the weights already set.

export function parsePantryText(raw: string): PantryItem[] {
  const seen = new Set<string>();
  const out: PantryItem[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const name = part.trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out;
}

// Append the items that are not in the pantry yet, keeping existing weights.
// Names only — for buying more of something you already have, use
// `replenishPantry`, which adds quantities instead of dropping duplicates.
export function mergePantry(current: PantryItem[], incoming: PantryItem[]): PantryItem[] {
  const known = new Set(current.map((item) => item.name.trim().toLowerCase()));
  const fresh = incoming.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || known.has(key)) return false;
    known.add(key);
    return true;
  });
  return [...current, ...fresh];
}

// Shrink the photo before upload: the model doesn't need more than ~1024px
// to read a fridge shelf, and it keeps the request well under the body cap.
async function toJpegDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}

// Item names the model can see in a fridge photo; throws on transport or
// model failure, returns [] when the photo holds no food.
export async function scanFridgePhoto(file: Blob): Promise<string[]> {
  const image = await toJpegDataUrl(file);
  const res = await fetch('/api/parse-fridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error('scan_failed');
  const data: { items?: unknown } = await res.json();
  return Array.isArray(data.items) ? data.items.filter((i): i is string => typeof i === 'string') : [];
}

// Units a bought amount can be folded into an existing row with.
const BASE: Partial<Record<PantryUnit, PantryUnit>> = { g: 'g', kg: 'g', ml: 'ml', l: 'ml' };

function sameFamily(a: PantryItem, b: PantryItem): boolean {
  const one = BASE[a.unit ?? 'g'];
  const two = BASE[b.unit ?? 'g'];
  return one !== undefined && one === two;
}

// Groceries just bought, added to what is already at home. Compatible units
// are summed in the existing row's unit; anything else (pieces against a
// weight, or an unknown amount on either side) falls back to a row with no
// amount, which the app reads as "enough of it" — an honest unknown rather
// than an invented number.
export function replenishPantry(current: PantryItem[], bought: PantryItem[]): PantryItem[] {
  const out = [...current];
  for (const purchase of bought) {
    const key = purchase.name.trim().toLowerCase();
    if (!key) continue;
    const index = out.findIndex((item) => item.name.trim().toLowerCase() === key);
    if (index === -1) {
      out.push(purchase);
      continue;
    }
    const existing = out[index];
    const bothPieces = (existing.unit ?? 'g') === 'pc' && purchase.unit === 'pc';
    const known = existing.amount !== undefined && purchase.amount !== undefined;

    if (known && bothPieces) {
      out[index] = { ...existing, amount: existing.amount! + purchase.amount! };
    } else if (known && sameFamily(existing, purchase)) {
      const total = (pantryGrams(existing) ?? 0) + (pantryGrams(purchase) ?? 0);
      const unit = existing.unit ?? 'g';
      const factor = unit === 'kg' || unit === 'l' ? 1000 : 1;
      out[index] = { name: existing.name, amount: Math.round((total / factor) * 100) / 100, unit };
    } else {
      out[index] = { name: existing.name };
    }
  }
  return out;
}
