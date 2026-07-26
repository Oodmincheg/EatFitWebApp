import { NextResponse } from 'next/server';
import { getUid } from '@/lib/session';
import { listPlans } from '@/lib/db/queries';

export const runtime = 'nodejs';

// GET /api/plans → { plans: MealPlan[] } newest first (index 0 = current)
export async function GET() {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  try {
    const plans = await listPlans(uid);
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
