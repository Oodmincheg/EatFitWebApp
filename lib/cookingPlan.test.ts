import { describe, expect, it } from 'vitest';
import { applyCookingAction, batchRemaining, CookingPlanError, cookingShoppingSource, createCookingPlan, incompleteShopping, mergeCookingProposal, nutritionPerServing, recipeSnapshot, seedCookingPins, validateCookingPlan } from './cookingPlan';
import { DishInputSchema, type Dish } from './schemas';
import { shoppingList } from './shopping';

const dish: Dish = {
  id: 'soup', name: 'Soup', createdAt: '2026-09-28T00:00:00Z', recipeServings: 2,
  classification: 'regular', ingredients: [{ name: 'potato', grams: 400 }], kcal: 800,
};
const monday = { date: '2026-09-28', slot: 'dinner' as const };
const tuesday = { date: '2026-09-29', slot: 'lunch' as const };
const empty = () => createCookingPlan('plan', '2026-09-28', 3, ['breakfast', 'lunch', 'dinner'], '2026-09-28T00:00:00Z');
const cooked = () => applyCookingAction(empty(), { type: 'cook', at: monday, dishId: dish.id, servings: 4 }, dish, 'batch');
const reused = () => applyCookingAction(cooked(), { type: 'reuse', at: tuesday, batchId: 'batch' });

describe('shared cooking', () => {
  it('reserves two servings at each meal and rejects overspending', () => {
    const plan = reused();
    expect(batchRemaining(plan, 'batch')).toBe(0);
    expect(() => applyCookingAction(plan, { type: 'reuse', at: { ...tuesday, slot: 'dinner' }, batchId: 'batch' })).toThrow('not_enough_portions');
    expect(batchRemaining(cooked(), 'batch')).toBe(2);
  });
  it('rejects meals before cooking, even earlier slots on the same date', () => {
    expect(() => applyCookingAction(cooked(), { type: 'reuse', at: { ...monday, slot: 'lunch' }, batchId: 'batch' })).toThrow('before_cooking');
  });
  it('protects dependent meals and allows removing leftovers first', () => {
    expect(() => applyCookingAction(reused(), { type: 'remove', at: monday })).toThrow('batch_in_use');
    const withoutLunch = applyCookingAction(reused(), { type: 'remove', at: tuesday });
    expect(applyCookingAction(withoutLunch, { type: 'remove', at: monday }).batches).toEqual([]);
    expect(() => applyCookingAction(reused(), { type: 'resize', batchId: 'batch', servings: 2 })).toThrow('not_enough_portions');
  });
  it('moves cooking only while its dependent meals remain after it', () => {
    expect(() => applyCookingAction(reused(), { type: 'move', from: monday, to: { ...tuesday, slot: 'dinner' } })).toThrow('before_cooking');
    const plan = applyCookingAction(reused(), { type: 'move', from: monday, to: { ...monday, slot: 'lunch' } });
    expect(plan.batches[0].cookAt.slot).toBe('lunch');
    expect(plan.assignments[1]).toMatchObject(tuesday);
  });
  it('counts a reused batch once and independent batches separately', () => {
    expect(shoppingList(cookingShoppingSource(reused()), [{ name: 'potato', amount: 200, unit: 'g' }])[0].grams).toBe(600);
    const next = applyCookingAction(reused(), { type: 'cook', at: { ...tuesday, slot: 'dinner' }, dishId: dish.id, servings: 2 }, dish, 'another');
    expect(shoppingList(cookingShoppingSource(next), [])[0].grams).toBe(1200);
  });
  it('copies the recipe, requires an explicit legacy yield and distinguishes missing nutrition', () => {
    const input = structuredClone(dish);
    const plan = applyCookingAction(empty(), { type: 'cook', at: monday, dishId: dish.id, servings: 2 }, input, 'batch');
    input.ingredients[0].grams = 999;
    expect(plan.batches[0].recipe.ingredients[0].grams).toBe(400);
    expect(nutritionPerServing(plan.batches[0].recipe)).toMatchObject({ kcal: 400, protein_g: undefined });
    expect(() => recipeSnapshot({ ...dish, recipeServings: undefined })).toThrow('recipe_setup_required');
    expect(DishInputSchema.parse({ name: 'Unknown', ingredients: [] }).kcal).toBeUndefined();
    expect(DishInputSchema.parse({ name: 'Zero', ingredients: [], kcal: 0 }).kcal).toBe(0);
  });
  it('marks an incomplete recipe without inventing weights', () => {
    const plan = applyCookingAction(empty(), { type: 'cook', at: monday, dishId: dish.id, servings: 2 }, { ...dish, ingredients: [{ name: 'salt' }] }, 'batch');
    expect(incompleteShopping(plan)).toEqual(['Soup']);
    expect(shoppingList(cookingShoppingSource(plan), [])[0].grams).toBe(0);
  });
  it('rejects invalid dates, duplicate slots and broken references', () => {
    expect(() => createCookingPlan('id', '2026-02-31', 3, ['lunch', 'dinner'], '')).toThrow('invalid_date');
    expect(() => validateCookingPlan({ ...cooked(), assignments: [...cooked().assignments, ...cooked().assignments] })).toThrow('slot_occupied');
    expect(() => validateCookingPlan({ ...cooked(), batches: [] })).toThrow('batch_not_found');
  });
  it('does not let AI overwrite an existing meal or silently use experiments', () => {
    expect(() => mergeCookingProposal(cooked(), { batches: [], assignments: [{ ...monday, batchId: 'batch', servings: 2 }] }, [dish], [])).toThrow('slot_occupied');
    expect(() => mergeCookingProposal(empty(), {
      batches: [{ id: 'trial', dishId: dish.id, cookAt: monday, servings: 2 }], assignments: [],
    }, [{ ...dish, classification: 'experimental' }], [])).toThrow('dish_not_allowed');
    expect(() => mergeCookingProposal(empty(), { batches: [], assignments: [] }, [dish], [])).toThrow(CookingPlanError);
  });
});

describe('shared plan generation and recurring recipes', () => {
  it('fills gaps with repeats and requested experiments while preserving an away meal', () => {
    const at = { date: '2026-09-28', slot: 'breakfast' as const };
    const base = applyCookingAction(createCookingPlan('id', at.date, 3, ['breakfast', 'dinner'], ''), { type: 'away', at });
    const trial: Dish = { ...dish, id: 'trial', classification: 'experimental' };
    const result = mergeCookingProposal(base, {
      batches: [
        { id: 'regular-batch', dishId: dish.id, cookAt: monday, servings: 6 },
        { id: 'trial-batch', dishId: trial.id, cookAt: { date: '2026-09-30', slot: 'breakfast' }, servings: 4 },
      ],
      assignments: [
        { ...monday, batchId: 'regular-batch', servings: 2 },
        { date: '2026-09-29', slot: 'breakfast', batchId: 'regular-batch', servings: 2 },
        { date: '2026-09-29', slot: 'dinner', batchId: 'regular-batch', servings: 2 },
        { date: '2026-09-30', slot: 'breakfast', batchId: 'trial-batch', servings: 2 },
        { date: '2026-09-30', slot: 'dinner', batchId: 'trial-batch', servings: 2 },
      ],
    }, [dish, trial], ['trial']);
    expect(result.assignments[0]).toEqual(base.assignments[0]);
    expect(result.batches).toHaveLength(2);
    expect(result.batches.map((b) => batchRemaining(result, b.id))).toEqual([0, 0]);
    expect(shoppingList(cookingShoppingSource(result), [])[0].grams).toBe(2000);
    expect(base.assignments).toHaveLength(1);
  });
  it('rescales shopping when yield changes without changing meal portions', () => {
    const next = applyCookingAction(reused(), { type: 'resize', batchId: 'batch', servings: 6 });
    expect(shoppingList(cookingShoppingSource(next), [])[0].grams).toBe(1200);
    expect(batchRemaining(next, 'batch')).toBe(2);
    expect(next.assignments).toEqual(reused().assignments);
  });
});


it('seeds only configured regular pins as independent batches', () => {
  let id = 0;
  const legacy = { ...dish, id: 'legacy', recipeServings: undefined };
  const trial: Dish = { ...dish, id: 'trial', classification: 'experimental' };
  const plan = seedCookingPins(empty(), {
    Monday: { breakfast: dish.id, lunch: dish.id, dinner: trial.id },
    Tuesday: { breakfast: legacy.id },
  }, [dish, legacy, trial], () => `batch-${id++}`);
  expect(plan.batches).toHaveLength(2);
  expect(plan.batches.map((b) => b.servings)).toEqual([2, 2]);
  expect(plan.batches[0].id).not.toBe(plan.batches[1].id);
  expect(plan.assignments).toHaveLength(2);
});
