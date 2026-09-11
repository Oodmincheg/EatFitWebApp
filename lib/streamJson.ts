// Pulls complete objects out of a `"days": [...]` array while the model is
// still writing it, so a single week-long completion can be shown day by day.

interface Scan {
  objects: string[];
  // Where to resume scanning next time more text arrives.
  next: number;
}

// `from` is the cursor a previous call returned; pass 0 on the first call.
export function scanArrayObjects(text: string, key: string, from: number): Scan {
  const objects: string[] = [];
  let i = from;

  if (i === 0) {
    const at = text.indexOf(`"${key}"`);
    if (at === -1) return { objects, next: 0 };
    const bracket = text.indexOf('[', at);
    if (bracket === -1) return { objects, next: 0 };
    i = bracket + 1;
  }

  while (i < text.length) {
    // Skip whatever separates two elements.
    while (i < text.length && text[i] !== '{') {
      if (text[i] === ']') return { objects, next: i };
      i++;
    }
    if (i >= text.length) break;

    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    // The object is still being written — resume from its start next time.
    if (end === -1) return { objects, next: start };

    objects.push(text.slice(start, end + 1));
    i = end + 1;
  }

  return { objects, next: i };
}
