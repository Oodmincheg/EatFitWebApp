import {
  DAY_NAMES,
  MEAL_SLOTS,
  daySlots,
  type DayName,
  type DayPlan,
  type Dish,
  type Meal,
  type MealPlan,
  type MealSlot,
  type Pins,
} from './schemas';

// A pinned slot holds one of the user's dishes, carried as a Meal with dishId.
export type PinnedDay = Partial<Record<MealSlot, Meal>>;
export type PinnedWeek = Partial<Record<DayName, PinnedDay>>;

export function dishToMeal(dish: Dish): Meal {
  return {
    name: dish.name,
    kcal: dish.kcal,
    protein_g: dish.protein_g,
    fat_g: dish.fat_g,
    carbs_g: dish.carbs_g,
    ingredients: dish.ingredients.map((i) => ({ name: i.name, grams: i.grams })),
    dishId: dish.id,
  };
}

// Resolve the pin template to meals; pins pointing at deleted dishes are skipped.
export function pinnedWeek(pins: Pins, dishes: Dish[]): PinnedWeek {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const week: PinnedWeek = {};
  for (const day of DAY_NAMES) {
    const slots = pins[day];
    if (!slots) continue;
    for (const slot of MEAL_SLOTS) {
      const id = slots[slot];
      const dish = id ? byId.get(id) : undefined;
      if (dish) (week[day] ??= {})[slot] = dishToMeal(dish);
    }
  }
  return week;
}

// The slots generation has to fill: the profile's active slots minus the
// ones the user pinned a dish into.
export function freeSlots(pinned: PinnedDay | undefined, slots: MealSlot[]): MealSlot[] {
  return slots.filter((slot) => !pinned?.[slot]);
}

// Totals from the meals; macro totals only when every meal carries macros.
export function withDayTotals(day: DayPlan): DayPlan {
  const meals = daySlots(day).map((slot) => day.meals[slot]!);
  const out: DayPlan = {
    day: day.day,
    meals: day.meals,
    total_kcal: meals.reduce((sum, m) => sum + m.kcal, 0),
  };
  if (meals.every((m) => m.protein_g != null && m.fat_g != null && m.carbs_g != null)) {
    out.total_protein_g = meals.reduce((sum, m) => sum + (m.protein_g ?? 0), 0);
    out.total_fat_g = meals.reduce((sum, m) => sum + (m.fat_g ?? 0), 0);
    out.total_carbs_g = meals.reduce((sum, m) => sum + (m.carbs_g ?? 0), 0);
  }
  return out;
}

// Pin replaces the slot's meal; unpin keeps the meal but drops its dishId so
// the next generation is free to replace it.
export function applyPinToPlan(
  plan: MealPlan,
  day: DayName,
  slot: MealSlot,
  meal: Meal | null
): MealPlan {
  return {
    ...plan,
    days: plan.days.map((d) => {
      if (d.day !== day) return d;
      const meals = { ...d.meals };
      if (meal) {
        meals[slot] = meal;
      } else if (meals[slot]) {
        const rest = { ...meals[slot] };
        delete rest.dishId;
        meals[slot] = rest;
      }
      return withDayTotals({ ...d, meals });
    }),
  };
}

// A dish was edited: every plan slot pinned to it shows the new values.
export function refreshDishInPlan(plan: MealPlan, dish: Dish): MealPlan {
  const meal = dishToMeal(dish);
  return {
    ...plan,
    days: plan.days.map((d) => {
      if (!MEAL_SLOTS.some((slot) => d.meals[slot]?.dishId === dish.id)) return d;
      const meals = { ...d.meals };
      for (const slot of MEAL_SLOTS) if (meals[slot]?.dishId === dish.id) meals[slot] = meal;
      return withDayTotals({ ...d, meals });
    }),
  };
}

// A dish was deleted: its plan slots keep their meal but lose the link.
export function unlinkDishInPlan(plan: MealPlan, dishId: string): MealPlan {
  return {
    ...plan,
    days: plan.days.map((d) => {
      if (!MEAL_SLOTS.some((slot) => d.meals[slot]?.dishId === dishId)) return d;
      const meals = { ...d.meals };
      for (const slot of MEAL_SLOTS) {
        if (meals[slot]?.dishId === dishId) {
          const rest = { ...meals[slot] };
          delete rest.dishId;
          meals[slot] = rest;
        }
      }
      return { ...d, meals };
    }),
  };
}

export function removeDishFromPins(pins: Pins, dishId: string): Pins {
  const out: Pins = {};
  for (const day of DAY_NAMES) {
    const slots = pins[day];
    if (!slots) continue;
    const kept = Object.fromEntries(
      Object.entries(slots).filter(([, id]) => id !== dishId)
    ) as Partial<Record<MealSlot, string>>;
    if (Object.keys(kept).length) out[day] = kept;
  }
  return out;
}
