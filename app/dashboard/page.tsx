'use client';

import Link from 'next/link';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { WeekStrip } from '@/components/dashboard/WeekStrip';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/hooks/useSession';
import { useProgress } from '@/hooks/useProgress';
import { addDays, dateKey, planStart } from '@/lib/dates';

export default function TodayPage() {
  const { profile, plan } = useSession();
  const { byDate, loading, toggle } = useProgress();

  // Layout guards guarantee a profile before this renders.
  if (!profile) return null;

  const now = new Date();
  const todayKey = dateKey(now);
  // days[i] falls on planStart + i; today may be outside the plan's window.
  const todayPlan = plan?.days.find(
    (_, i) => dateKey(addDays(planStart(plan), i)) === todayKey
  );

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-extrabold">Today</h1>
        <p className="mt-0.5 text-sm font-semibold text-latte">
          {now.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <section className="rounded-3xl border-2 border-ink bg-white p-4 sm:p-5">
            <h2 className="text-[11px] font-bold tracking-widest text-latte">
              📈 THIS WEEK
            </h2>
            <div className="mt-3">
              <WeekStrip byDate={byDate} todayKey={todayKey} />
            </div>
          </section>

          {todayPlan ? (
            <TodayCard
              day={todayPlan}
              target={profile.calorieTarget}
              eaten={byDate[todayKey] ?? []}
              onToggle={(slot, eaten) => toggle(todayKey, slot, eaten)}
            />
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-sand py-16 text-center">
              <p className="text-3xl" aria-hidden="true">
                🍽️
              </p>
              <p className="mt-3 font-display text-lg font-extrabold">No plan for today</p>
              <p className="mt-1 text-sm text-latte">
                Generate a weekly menu to start tracking your meals.
              </p>
              <Link
                href="/dashboard/plan"
                className="mt-4 inline-block rounded-full bg-tomato px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_var(--color-tomato-deep)] hover:bg-tomato-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tomato"
              >
                Go to Week plan →
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
