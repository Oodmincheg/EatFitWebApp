'use client';

import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-tomato text-white font-bold shadow-[0_4px_0_var(--color-tomato-deep)] hover:bg-tomato-deep active:translate-y-0.5 active:shadow-[0_2px_0_var(--color-tomato-deep)] disabled:bg-tomato/50 disabled:shadow-none',
  secondary:
    'bg-paper text-ink font-bold border-2 border-ink hover:bg-peach disabled:border-sand disabled:text-sand',
  ghost: 'text-latte font-semibold hover:bg-ink/5 hover:text-ink disabled:text-sand',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
