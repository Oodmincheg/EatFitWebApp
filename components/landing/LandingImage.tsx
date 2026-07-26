import Image from 'next/image';
import type { LandingImageSlot } from './images';

/**
 * Renders a landing image slot: the real asset when `src` is set, otherwise a
 * styled gradient placeholder so the layout reads as designed before assets land.
 */
export function LandingImage({
  slot,
  className = '',
  sizes,
  priority = false,
}: {
  slot: LandingImageSlot;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (!slot.src) {
    return (
      <div
        role="img"
        aria-label={slot.alt}
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
      alt={slot.alt}
      width={slot.width}
      height={slot.height}
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}
