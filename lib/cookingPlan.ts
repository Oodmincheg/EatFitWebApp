import { z } from 'zod';
import {
  CookingPlanSchema, RecipeSnapshotSchema, MEAL_SLOTS,
  type CookingAction, type CookingAssignment, type CookingBatch, type CookingPlan,
  type Dish, type MealPlan, type MealSlot, type RecipeSnapshot,
} from './schemas';
import { addDays, dateKey, parseDateKey, weekdayName } from './dates';

type Position = { date: string; slot: MealSlot };

export class CookingPlanError extends Error {}

export function positionKey(at: Position): string {
  return `${at.date}/${at.slot}`;
}

export function positionOrder(at: Position): string {
  return `${at.date}/${MEAL_SLOTS.indexOf(at.slot)}`;
}

export function cookingDates(plan: CookingPlan): string[] {
  return Array.from({ length: plan.dayCount }, (_, i) => dateKey(addDays(parseDateKey(plan.startDate), i)));
}

export function batchRemaining(plan: CookingPlan, batchId: string): number {
  const batch = plan.batches.find((b) => b.id === batchId);
  if (!batch) throw new CookingPlanError('batch_not_found');
  return batch.servings - plan.assignments.reduce((sum, a) => sum + (a.kind === 'meal' && a.batchId === batchId ? a.servings : 0), 0);
}

export function validateCookingPlan(input: unknown): CookingPlan {
  const plan = CookingPlanSchema.parse(input);
  if (dateKey(parseDateKey(plan.startDate)) !== plan.startDate) throw new CookingPlanError('invalid_date');
  const dates = new Set(cookingDates(plan));
  const slots = new Set(plan.slots);
  if (slots.size !== plan.slots.length) throw new CookingPlanError('invalid_slot');
  const validPosition = (at: Position) => dates.has(at.date) && slots.has(at.slot);
  const ids = new Set<string>();
  for (const batch of plan.batches) {
    if (ids.has(batch.id)) throw new CookingPlanError('duplicate_batch');
    if (!validPosition(batch.cookAt)) throw new CookingPlanError('invalid_date');
    ids.add(batch.id);
  }
  const assigned = new Set<string>();
  for (const a of plan.assignments) {
    if (!validPosition(a)) throw new CookingPlanError('invalid_date');
    if (assigned.has(positionKey(a))) throw new CookingPlanError('slot_occupied');
    assigned.add(positionKey(a));
    if (a.kind === 'away') continue;
    const batch = plan.batches.find((b) => b.id === a.batchId);
    if (!batch) throw new CookingPlanError('batch_not_found');
    if (positionOrder(a) < positionOrder(batch.cookAt)) throw new CookingPlanError('before_cooking');
  }
  for (const batch of plan.batches) {
    if (batchRemaining(plan, batch.id) < 0) throw new CookingPlanError('not_enough_portions');
    if (!plan.assignments.some((a) => a.kind === 'meal' && a.batchId === batch.id && positionKey(a) === positionKey(batch.cookAt))) {
      throw new CookingPlanError('cooking_meal_required');
    }
  }
  return plan;
}

export function recipeSnapshot(dish: Dish): RecipeSnapshot {
  if (!dish.recipeServings || !dish.classification) throw new CookingPlanError('recipe_setup_required');
  return RecipeSnapshotSchema.parse({ ...dish, dishId: dish.id });
}

export function createCookingPlan(id: string, startDate: string, dayCount: 3 | 5 | 7, slots: MealSlot[], now: string): CookingPlan {
  return validateCookingPlan({ version: 2, id, revision: 0, generatedAt: now, startDate, dayCount, slots, batches: [], assignments: [] });
}

export function applyCookingAction(plan: CookingPlan, action: Exclude<CookingAction, { type: 'create' }>, dish?: Dish, batchId?: string): CookingPlan {
  const next = structuredClone(plan);
  if (action.type === 'resize') {
    const batch = next.batches.find((b) => b.id === action.batchId);
    if (!batch) throw new CookingPlanError('batch_not_found');
    batch.servings = action.servings;
  } else if (action.type === 'move') {
    const a = next.assignments.find((a) => positionKey(a) === positionKey(action.from));
    if (!a) throw new CookingPlanError('meal_not_found');
    if (next.assignments.some((a) => positionKey(a) === positionKey(action.to))) throw new CookingPlanError('slot_occupied');
    if (a.kind === 'meal') {
      const batch = next.batches.find((b) => b.id === a.batchId)!;
      if (positionKey(batch.cookAt) === positionKey(a)) batch.cookAt = action.to;
    }
    Object.assign(a, action.to);
  } else {
    const existing = next.assignments.find((a) => positionKey(a) === positionKey(action.at));
    if (existing?.kind === 'meal') {
      const batch = next.batches.find((b) => b.id === existing.batchId)!;
      if (positionKey(batch.cookAt) === positionKey(existing)) {
        if (next.assignments.some((a) => a !== existing && a.kind === 'meal' && a.batchId === batch.id)) {
          throw new CookingPlanError('batch_in_use');
        }
        next.batches = next.batches.filter((b) => b.id !== batch.id);
      }
    }
    next.assignments = next.assignments.filter((a) => a !== existing);
    if (action.type === 'cook') {
      if (!dish || !batchId) throw new CookingPlanError('dish_not_found');
      next.batches.push({ id: batchId, recipe: recipeSnapshot(dish), cookAt: action.at, servings: action.servings });
      next.assignments.push({ ...action.at, kind: 'meal', batchId, servings: 2 });
    } else if (action.type === 'reuse') {
      next.assignments.push({ ...action.at, kind: 'meal', batchId: action.batchId, servings: 2 });
    } else if (action.type === 'away') {
      next.assignments.push({ ...action.at, kind: 'away' });
    }
  }
  next.revision += 1;
  return validateCookingPlan(next);
}

export function nutritionPerServing(recipe: RecipeSnapshot) {
  const per = (value: number | undefined) => value === undefined ? undefined : Math.round(value / recipe.recipeServings);
  return { kcal: per(recipe.kcal), protein_g: per(recipe.protein_g), fat_g: per(recipe.fat_g), carbs_g: per(recipe.carbs_g) };
}

export function incompleteShopping(plan: CookingPlan): string[] {
  return plan.batches.filter((b) => !b.recipe.ingredients.length || b.recipe.ingredients.some((i) => i.grams === undefined))
    .map((b) => b.recipe.name);
}

export function cookingShoppingSource(plan: CookingPlan): MealPlan {
  return {
    generatedAt: plan.generatedAt,
    startDate: plan.startDate,
    days: cookingDates(plan).map((date) => ({
      day: weekdayName(parseDateKey(date)), total_kcal: 0,
      meals: Object.fromEntries(plan.batches.filter((b) => b.cookAt.date === date).map((b) => [b.cookAt.slot, {
        name: b.recipe.name, kcal: 0,
        ingredients: b.recipe.ingredients.map((i) => ({ name: i.name, grams: i.grams === undefined ? 0 : i.grams * b.servings / b.recipe.recipeServings })),
      }])),
    })),
  };
}

export function seedCookingPins(plan: CookingPlan, pins: Partial<Record<string, Partial<Record<MealSlot, string>>>>, dishes: Dish[], mintId: () => string): CookingPlan {
  let next = plan;
  for (const date of cookingDates(plan)) {
    const day = weekdayName(parseDateKey(date));
    for (const slot of plan.slots) {
      const id = pins[day]?.[slot];
      const dish = dishes.find((d) => d.id === id);
      if (dish?.recipeServings && dish.classification === 'regular') {
        next = applyCookingAction(next, { type: 'cook', at: { date, slot }, dishId: dish.id, servings: 2 }, dish, mintId());
      }
    }
  }
  return next;
}

export const CookingProposalSchema = z.object({
  batches: z.array(z.object({
    id: z.string().min(1).max(100), dishId: z.string().min(1),
    cookAt: z.object({ date: z.string(), slot: z.enum(MEAL_SLOTS) }),
    servings: z.number().int().min(2).max(40),
  })).max(35),
  assignments: z.array(z.object({
    date: z.string(), slot: z.enum(MEAL_SLOTS), batchId: z.string().min(1), servings: z.literal(2),
  })).max(35),
});
export type CookingProposal = z.infer<typeof CookingProposalSchema>;

export function mergeCookingProposal(plan: CookingPlan, proposal: CookingProposal, dishes: Dish[], experimentalIds: string[]): CookingPlan {
  const existingIds = new Set(plan.batches.map((b) => b.id));
  const additions: CookingBatch[] = proposal.batches.map((b) => {
    if (existingIds.has(b.id)) throw new CookingPlanError('duplicate_batch');
    const dish = dishes.find((d) => d.id === b.dishId);
    if (!dish || (dish.classification !== 'regular' && !experimentalIds.includes(dish.id))) throw new CookingPlanError('dish_not_allowed');
    return { id: b.id, recipe: recipeSnapshot(dish), cookAt: b.cookAt, servings: b.servings };
  });
  const assignments: CookingAssignment[] = proposal.assignments.map((a) => ({ ...a, kind: 'meal' }));
  const next = validateCookingPlan({ ...plan, revision: plan.revision + 1, batches: [...plan.batches, ...additions], assignments: [...plan.assignments, ...assignments] });
  if (next.assignments.length !== plan.dayCount * plan.slots.length) throw new CookingPlanError('incomplete_plan');
  for (const id of experimentalIds) {
    if (!next.batches.some((b) => b.recipe.dishId === id)) throw new CookingPlanError('experiment_missing');
  }
  return next;
}
