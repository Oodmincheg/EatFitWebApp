import type { DietaryTag } from './schemas';

export const TAG_OPTIONS: { value: DietaryTag; label: string }[] = [
  { value: 'lactose_free', label: 'Lactose-free' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'nut_allergy', label: 'Nut allergy' },
];
