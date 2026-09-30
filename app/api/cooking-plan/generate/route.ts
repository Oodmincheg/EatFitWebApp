import { NextResponse } from 'next/server';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { CookingGenerateSchema } from '@/lib/schemas';
import { findUser, listDishes } from '@/lib/db/queries';
import { latestCookingPlan, updateCookingPlan } from '@/lib/db/cookingPlans';
import { GenerationFailedError, UpstreamError, generateSharedCookingPlan } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    const parsed = CookingGenerateSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    const { planId, revision, experimentalDishIds } = parsed.data;
    const current = await latestCookingPlan(uid);
    if (!current || current.id !== planId || current.revision !== revision) return NextResponse.json({ error: 'plan_conflict' }, { status: 409 });
    const user = await findUser(uid);
    if (!user?.profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });
    const recipes = (await listDishes(uid)).filter((d) => d.recipeServings && (d.classification === 'regular' || d.classification === 'experimental' && experimentalDishIds.includes(d.id)));
    if (experimentalDishIds.some((id) => !recipes.some((d) => d.id === id && d.classification === 'experimental'))) return NextResponse.json({ error: 'recipe_setup_required' }, { status: 400 });
    if (!recipes.length) return NextResponse.json({ error: 'no_recipes' }, { status: 409 });
    const plan = await generateSharedCookingPlan(current, recipes, experimentalDishIds, user.profile);
    if (!await updateCookingPlan(uid, plan, current.revision)) return NextResponse.json({ error: 'plan_conflict' }, { status: 409 });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof BodyError) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof UpstreamError) return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    if (error instanceof GenerationFailedError) return NextResponse.json({ error: 'generation_failed' }, { status: 422 });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
