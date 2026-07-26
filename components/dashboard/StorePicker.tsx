'use client';

import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import { STORE_OPTIONS, type StoreOption } from '@/lib/stores';

export function StorePicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (store: StoreOption) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="store-picker-title">
      <h2 id="store-picker-title" className="font-display text-xl font-extrabold">
        Where should we build your cart?
      </h2>
      <p className="mt-1 text-sm text-latte">
        Pick a store — we&rsquo;ll match your list to its live products and prices.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {STORE_OPTIONS.map((store) => (
          <button
            key={store.id}
            onClick={() => onPick(store)}
            className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-white p-4 text-left transition-colors hover:bg-peach focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
          >
            <Image
              src={store.logo}
              alt=""
              width={80}
              height={40}
              className="h-10 w-20 shrink-0 object-contain"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base font-extrabold text-ink">
                {store.label}
              </span>
              <span className="block text-xs font-semibold text-latte">
                {store.city} · {store.blurb}
              </span>
            </span>
            <span aria-hidden="true" className="text-lg font-bold text-tomato">
              →
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full text-center text-xs font-bold text-latte underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
      >
        Cancel
      </button>
    </Modal>
  );
}
