'use client';

import { CSSProperties, ReactNode, useEffect, useRef } from 'react';

/**
 * Fades + slides children in when they scroll into view (once).
 * Styling lives on [data-reveal] in globals.css; `delay` staggers siblings.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal
      className={className}
      style={{ '--d': `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
