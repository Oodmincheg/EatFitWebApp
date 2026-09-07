import Image from 'next/image';
import type { LandingImageSlot } from './images';

/**
 * Renders a landing image slot: the real asset when `src` is set, otherwise a
 * styled gradient placeholder so the layout reads as designed before assets land.
 * `alt` overrides the slot's English alt with the active language.
 */
export function LandingImage({
  slot,
  alt,
  className = '',
  sizes,
  priority = false,
}: {
  slot: LandingImageSlot;
  alt?: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const label = alt ?? slot.alt;
  if (!slot.src) {
    return (
      <div
        role="img"
        aria-label={label}
        className={`flex items-center justify-center ${slot.fallback} ${className}`}
      >
        <span aria-hidden="true" className="text-6xl opacity-40 sm:text-7xl">
          {slot.emoji}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={slot.src}
      alt={label}
      width={slot.width}
      height={slot.height}
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}
