/**
 * Landing image manifest. Every visual slot on the landing page resolves here.
 *
 * `src: null` renders a styled fallback until the real asset exists.
 * `prompt` is the Higgsfield generation prompt for the slot — once images are
 * generated, save them under /public/images/landing/ and fill in `src`.
 */
export type LandingImageSlot = {
  src: string | null;
  alt: string;
  width: number;
  height: number;
  /** Tailwind classes for the styled fallback shown while src is null */
  fallback: string;
  /** Decorative emoji watermark shown on the fallback */
  emoji: string;
  /** Higgsfield prompt used to generate this asset */
  prompt: string;
};

export const LANDING_IMAGES = {
  hero: {
    src: '/images/landing/hero.jpg',
    alt: 'A colourful bowl of fresh, healthy food',
    width: 1080,
    height: 1080,
    fallback:
      'bg-[repeating-linear-gradient(48deg,#f5e2cf,#f5e2cf_9px,#fbecdd_9px,#fbecdd_18px)]',
    emoji: '🥗',
    prompt:
      'Bright playful editorial food photography, overhead view of one big colourful bowl — grains, roasted vegetables, greens, a soft egg — on a warm cream background, bold shadows, tomato-red and lime-green accents, cheerful and appetizing, 1:1 square',
  },
  featureCalories: {
    src: null,
    alt: 'Balanced plate of food with visible portion structure',
    width: 960,
    height: 720,
    fallback: 'bg-gradient-to-br from-peach via-cream to-apricot',
    emoji: '⚖️',
    prompt:
      'Minimal playful photo of a perfectly balanced plate: grilled salmon, quinoa, greens, cherry tomatoes, on a light ceramic plate, warm cream background, soft studio light, healthy and precise mood, 4:3',
  },
  featureFridge: {
    src: null,
    alt: 'Fresh ingredients laid out on a counter, ready to cook',
    width: 960,
    height: 720,
    fallback: 'bg-gradient-to-br from-mint via-cream to-peach',
    emoji: '🥦',
    prompt:
      'Overhead flat-lay of everyday fridge ingredients — broccoli, peppers, eggs, chicken breast, yogurt, herbs — arranged loosely on a warm cream counter, natural window light, zero-waste cooking mood, 4:3',
  },
  featureCart: {
    src: null,
    alt: 'Grocery delivery bag with fresh produce at a doorstep',
    width: 960,
    height: 720,
    fallback: 'bg-gradient-to-br from-apricot via-cream to-mint',
    emoji: '🛒',
    prompt:
      'Lifestyle photo of a paper grocery delivery bag full of fresh produce standing at a bright apartment doorstep, greens poking out of the top, warm inviting light, convenient modern delivery mood, 4:3',
  },
} satisfies Record<string, LandingImageSlot>;
