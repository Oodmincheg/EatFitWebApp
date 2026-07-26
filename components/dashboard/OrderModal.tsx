'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Order, OrderItem } from '@/lib/schemas';

type Phase = 'sending' | 'done' | 'failed';

// Places a real order (persisted with status "ordered") when opened.
export function OrderModal({
  open,
  onClose,
  items,
  placeOrder,
}: {
  open: boolean;
  onClose: () => void;
  items: OrderItem[];
  placeOrder: (items: OrderItem[]) => Promise<Order>;
}) {
  const [phase, setPhase] = useState<Phase>('sending');
  // The submit is kicked off by the open transition; ref avoids double-sends
  // from effect re-runs while the request is in flight.
  const sending = useRef(false);

  useEffect(() => {
    if (!open) {
      setPhase('sending');
      sending.current = false;
      return;
    }
    if (sending.current) return;
    sending.current = true;
    let cancelled = false;
    // Keep the spinner visible long enough to read, even on a fast network.
    Promise.all([
      placeOrder(items),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ])
      .then(() => !cancelled && setPhase('done'))
      .catch(() => !cancelled && setPhase('failed'));
    return () => {
      cancelled = true;
    };
  }, [open, items, placeOrder]);

  const firstItem = items[0]?.name ?? '';

  return (
    <Modal open={open} onClose={onClose} labelledBy="order-title">
      {phase === 'sending' && (
        <div className="py-6 text-center">
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-tomato border-t-transparent" />
          <p id="order-title" className="mt-4 font-semibold text-latte">
            Sending your basket…
          </p>
        </div>
      )}
      {phase === 'done' && (
        <div className="py-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-mint text-3xl text-lime-deep">
            ✓
          </span>
          <h2 id="order-title" className="mt-4 font-display text-xl font-extrabold">
            Your order has been sent for delivery
          </h2>
          <p className="mt-2 text-sm text-latte">
            {items.length} {items.length === 1 ? 'item' : 'items'} · Delivery in 60–90 min
          </p>
          {firstItem && (
            <a
              href={`https://glovoapp.com/ua/uk/search?q=${encodeURIComponent(firstItem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-bold text-tomato underline-offset-2 hover:underline"
            >
              Open in Glovo ↗
            </a>
          )}
          <div className="mt-5">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
      {phase === 'failed' && (
        <div className="py-2 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-apricot text-3xl text-tomato-deep">
            !
          </span>
          <h2 id="order-title" className="mt-4 font-display text-xl font-extrabold">
            Could not place the order
          </h2>
          <p className="mt-2 text-sm text-latte">
            Check your connection and try again from the shopping list.
          </p>
          <div className="mt-5">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
