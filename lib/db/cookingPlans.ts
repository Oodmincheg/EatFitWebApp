import 'server-only';
import { getDb } from './client';
import { validateCookingPlan } from '../cookingPlan';
import type { CookingPlan } from '../schemas';

type CookingPlanDoc = { _id: string; userId: string; plan: CookingPlan; createdAt: string };

async function collection() {
  return (await getDb()).collection<CookingPlanDoc>('cooking_plans', { ignoreUndefined: true });
}

export async function latestCookingPlan(uid: string): Promise<CookingPlan | null> {
  const doc = await (await collection()).find({ userId: uid }).sort({ createdAt: -1, _id: -1 }).limit(1).next();
  return doc ? validateCookingPlan(doc.plan) : null;
}

export async function listCookingPlans(uid: string): Promise<CookingPlan[]> {
  const docs = await (await collection()).find({ userId: uid }).sort({ createdAt: -1, _id: -1 }).limit(12).toArray();
  return docs.map((doc) => validateCookingPlan(doc.plan));
}

export async function insertCookingPlan(uid: string, plan: CookingPlan): Promise<void> {
  const valid = validateCookingPlan(plan);
  await (await collection()).insertOne({ _id: valid.id, userId: uid, plan: valid, createdAt: valid.generatedAt });
}

export async function updateCookingPlan(uid: string, plan: CookingPlan, revision: number): Promise<boolean> {
  const valid = validateCookingPlan(plan);
  const result = await (await collection()).updateOne(
    { _id: valid.id, userId: uid, 'plan.revision': revision }, { $set: { plan: valid } }
  );
  return result.matchedCount === 1;
}
