import { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-3xl border-2 border-ink bg-paper p-6 ${className}`} {...props} />
  );
}
