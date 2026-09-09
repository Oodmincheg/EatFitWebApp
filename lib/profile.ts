import {
  DEFAULT_MEAL_SLOTS,
  DEFAULT_PLAN_DAYS,
  orderSlots,
  type MealSlot,
  type PantryItem,
  type Profile,
} from './schemas';

// Profiles written before these settings existed fall back to the original
// behaviour: breakfast/lunch/dinner over seven days.
export function profileSlots(profile: Pick<Profile, 'mealSlots'>): MealSlot[] {
  const slots = profile.mealSlots?.length ? orderSlots(profile.mealSlots) : [];
  return slots.length >= 2 ? slots : DEFAULT_MEAL_SLOTS;
}

export function profilePlanDays(profile: Pick<Profile, 'planDays'>): number {
  return profile.planDays ?? DEFAULT_PLAN_DAYS;
}

// `ingredients` stays the single string the prompt and the owned-item
// matching read; it is derived from the pantry on every write.
export function pantryToIngredients(pantry: PantryItem[]): string {
  return pantry
    .map((item) => item.name.trim())
    .filter(Boolean)
    .join(', ')
    .slice(0, 4000);
}

// Legacy profiles hold only the free-text `ingredients`; split it into
// pantry rows on read so the pantry page has something to show.
export function coerceProfile(profile: Profile): Profile {
  if (profile.pantry?.length || !profile.ingredients?.trim()) {
    return { ...profile, pantry: profile.pantry ?? [] };
  }
  const pantry: PantryItem[] = profile.ingredients
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 120)
    .map((name) => ({ name }));
  return { ...profile, pantry };
}
