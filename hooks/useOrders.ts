'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Order, OrderItem } from '@/lib/schemas';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/orders')
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data: { orders: Order[] } = await res.json();
        setOrders(data.orders);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const placeOrder = useCallback(async (items: OrderItem[]): Promise<Order> => {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('order_failed');
    const data: { order: Order } = await res.json();
    setOrders((prev) => [data.order, ...prev]);
    return data.order;
  }, []);

  const markDelivered = useCallback(async (id: string) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' }),
    });
    if (!res.ok) throw new Error('update_failed');
    const data: { order: Order } = await res.json();
    setOrders((prev) => prev.map((o) => (o.id === id ? data.order : o)));
  }, []);

  return { orders, loading, placeOrder, markDelivered };
}
