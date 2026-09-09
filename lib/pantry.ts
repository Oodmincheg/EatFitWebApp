import type { PantryItem } from './schemas';

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
