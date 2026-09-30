import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCookingAction, createCookingPlan } from './cookingPlan';
import { ProfileSchema, type Dish } from './schemas';

vi.mock('server-only', () => ({}));
import { generateSharedCookingPlan, GenerationFailedError, UpstreamError } from './llm';

const profile = ProfileSchema.parse({ goal: 'maintenance', age: 35, weightKg: 80, heightCm: 180, sex: 'male', activityLevel: 'moderate', calorieTarget: 2500, ingredients: 'potato', pantry: [], dietaryTags: [], createdAt: '' });
const dish: Dish = { id: 'soup', name: 'Soup', createdAt: '', recipeServings: 2, classification: 'regular', ingredients: [{ name: 'potato', grams: 400 }] };
const empty = () => createCookingPlan('id', '2026-09-28', 3, ['breakfast', 'dinner'], '');
const proposal = {
  batches: [{ id: 'b', dishId: dish.id, cookAt: { date: '2026-09-28', slot: 'breakfast' }, servings: 12 }],
  assignments: ['2026-09-28', '2026-09-29', '2026-09-30'].flatMap((date) => ['breakfast', 'dinner'].map((slot) => ({ date, slot, batchId: 'b', servings: 2 }))),
};
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
function mockFetch() {
  vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
  vi.stubEnv('LITELLM_API_KEY', 'test-key');
  vi.stubEnv('LITELLM_MODEL', 'test-model');
  const mock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', mock);
  return mock;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('shared cooking model boundary', () => {
  it('retries semantic validation once and keeps unknown calories unknown', async () => {
    const request = mockFetch().mockResolvedValueOnce(response({ batches: [], assignments: [] })).mockResolvedValueOnce(response(proposal));
    const result = await generateSharedCookingPlan(empty(), [dish], [], profile);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.assignments).toHaveLength(6);
    expect(result.batches[0].recipe.kcal).toBeUndefined();
    const body = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(body.messages.at(-1).content).toContain('incomplete_plan');
    expect(body).not.toHaveProperty('temperature');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
  it('rejects two invalid attempts without altering the supplied plan', async () => {
    const request = mockFetch().mockImplementation(async () => response({ wrong: true }));
    const plan = empty();
    await expect(generateSharedCookingPlan(plan, [dish], [], profile)).rejects.toBeInstanceOf(GenerationFailedError);
    expect(request).toHaveBeenCalledTimes(2);
    expect(plan.batches).toEqual([]);
    expect(plan.revision).toBe(0);
  });
  it('preserves upstream failures and skips the model for a complete plan', async () => {
    const request = mockFetch().mockResolvedValue(new Response('', { status: 401 }));
    await expect(generateSharedCookingPlan(empty(), [dish], [], profile)).rejects.toBeInstanceOf(UpstreamError);
    expect(request).toHaveBeenCalledTimes(1);
    let full = empty();
    for (const a of proposal.assignments) full = applyCookingAction(full, { type: 'away', at: { date: a.date, slot: a.slot === 'breakfast' ? 'breakfast' : 'dinner' } });
    expect(await generateSharedCookingPlan(full, [dish], [], profile)).toEqual(full);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
