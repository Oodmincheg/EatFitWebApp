'use client';

import { ClipboardEvent, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useI18n } from '@/hooks/useI18n';
import { FRIDGE_DRAFT_KEY } from '@/lib/clientStorage';
import { DIETARY_TAGS } from '@/lib/dietary';
import type { DietaryTag } from '@/lib/schemas';

const MAX_LENGTH = 2000;

// Unconfirmed edits survive closing the dialog or reloading the tab; the
// draft is dropped once the user generates (the profile stores it then).
function readDraft(): { value: string; tags: DietaryTag[] } | null {
  try {
    const raw = sessionStorage.getItem(FRIDGE_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { value?: unknown }).value !== 'string' ||
      !Array.isArray((parsed as { tags?: unknown }).tags)
    ) {
      return null;
    }
    const known = new Set<DietaryTag>(DIETARY_TAGS);
    const { value, tags } = parsed as { value: string; tags: unknown[] };
    return {
      value: value.slice(0, MAX_LENGTH),
      tags: tags.filter((t): t is DietaryTag => known.has(t as DietaryTag)),
    };
  } catch {
    return null;
  }
}

function writeDraft(value: string, tags: DietaryTag[]) {
  try {
    sessionStorage.setItem(FRIDGE_DRAFT_KEY, JSON.stringify({ value, tags }));
  } catch {
    // Storage full or unavailable — the draft just won't survive.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(FRIDGE_DRAFT_KEY);
  } catch {
    // Ignore.
  }
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

// Append detected items to whatever the user already typed, skipping ones
// that are already in the list.
function mergeItems(current: string, items: string[]): string {
  const existing = new Set(
    current
      .split(/[\n,]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const fresh = items.filter((i) => !existing.has(i));
  if (!fresh.length) return current;
  const base = current.trim();
  const merged = base ? `${base.replace(/,$/, '')}, ${fresh.join(', ')}` : fresh.join(', ');
  return merged.slice(0, MAX_LENGTH);
}

// Pre-generation dialog: what's in the fridge right now, plus dietary
// preferences. Both are saved to the profile so they're prefilled next time.
// A photo of the fridge can be pasted or attached — the AI proposes items,
// which stay editable as text.
export function FridgeModal({
  open,
  initial,
  initialTags,
  onCancel,
  onGenerate,
}: {
  open: boolean;
  initial: string;
  initialTags: DietaryTag[];
  onCancel: () => void;
  onGenerate: (ingredients: string, dietaryTags: DietaryTag[]) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [tags, setTags] = useState<DietaryTag[]>(initialTags);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<'noFood' | 'readFailed' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed each time the dialog opens: an unconfirmed draft from this
  // browser session wins over the saved profile.
  useEffect(() => {
    if (open) {
      const draft = readDraft();
      setValue(draft?.value ?? initial);
      setTags(draft?.tags ?? initialTags);
      setScanning(false);
      setScanError(null);
    }
  }, [open, initial, initialTags]);

  // Keep the draft in sync while the dialog is open.
  useEffect(() => {
    if (open) writeDraft(value, tags);
  }, [open, value, tags]);

  const toggleTag = (tag: DietaryTag) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );

  const scanImage = async (file: Blob) => {
    if (scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const image = await toJpegDataUrl(file);
      const res = await fetch('/api/parse-fridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      if (!res.ok) throw new Error('scan failed');
      const data: { items?: string[] } = await res.json();
      const items = (data.items ?? []).filter((i) => typeof i === 'string');
      if (!items.length) {
        setScanError('noFood');
        return;
      }
      setValue((prev) => mergeItems(prev, items));
    } catch {
      setScanError('readFailed');
    } finally {
      setScanning(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith('image/')
    );
    const file = image?.getAsFile();
    if (file) {
      e.preventDefault();
      scanImage(file);
    }
  };

  return (
    <Modal open={open} onClose={onCancel} labelledBy="fridge-modal-title">
      <h2 id="fridge-modal-title" className="font-display text-xl font-extrabold">
        {t.fridge.title}
      </h2>
      <p className="mt-1 text-sm font-semibold text-latte">{t.fridge.text}</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={onPaste}
        placeholder={t.fridge.placeholder}
        rows={5}
        maxLength={MAX_LENGTH}
        autoFocus
        disabled={scanning}
        className="mt-4 w-full rounded-xl border-2 border-peach-line bg-white px-3 py-2.5 text-sm font-medium focus:border-ink focus:outline-none disabled:bg-peach/30"
        aria-label={t.fridge.aria}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) scanImage(file);
          }}
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
        >
          {scanning ? t.fridge.scanning : t.fridge.scan}
        </Button>
        {!scanning && (
          <span className="text-xs font-semibold text-latte">{t.fridge.orPaste}</span>
        )}
      </div>
      {scanError && (
        <p role="alert" className="mt-2 text-xs font-bold text-tomato">
          {t.fridge[scanError]}
        </p>
      )}
      <h3 className="mt-5 font-display text-sm font-extrabold">{t.fridge.prefsTitle}</h3>
      <p className="mt-0.5 text-xs font-semibold text-latte">{t.fridge.prefsText}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {DIETARY_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={t.dietary[tag]}
            selected={tags.includes(tag)}
            onClick={() => toggleTag(tag)}
          />
        ))}
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button
          onClick={() => {
            clearDraft();
            onGenerate(value.trim(), tags);
          }}
          disabled={scanning}
        >
          {t.fridge.generate}
        </Button>
      </div>
    </Modal>
  );
}
