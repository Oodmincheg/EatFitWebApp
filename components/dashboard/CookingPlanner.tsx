'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useCookingPlan } from '@/hooks/useCookingPlan';
import { useDishes } from '@/hooks/useDishes';
import { useI18n } from '@/hooks/useI18n';
import { batchRemaining, cookingDates, positionKey, positionOrder } from '@/lib/cookingPlan';
import { dateKey, parseDateKey } from '@/lib/dates';
import type { CookingAction, MealSlot } from '@/lib/schemas';
import { WeekTemplate } from './WeekTemplate';
import { CookingWeekView } from './CookingWeekView';

const field = 'w-full rounded-xl border-2 border-sand bg-paper p-2 text-ink';
type Position = { date: string; slot: MealSlot };

export function CookingPlanner() {
  const { t } = useI18n();
  const { plan, busy, error, clearError, mutate, generate } = useCookingPlan();
  const { dishes, loading } = useDishes();
  const [startDate, setStartDate] = useState(() => dateKey(new Date()));
  const [dayCount, setDayCount] = useState<3 | 5 | 7>(7);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [dishId, setDishId] = useState('');
  const [servings, setServings] = useState(2);
  const [batchId, setBatchId] = useState('');
  const [destination, setDestination] = useState('');
  const [experiments, setExperiments] = useState<string[]>([]);
  const ready = dishes.filter((d) => d.recipeServings && d.classification);
  const current = editing && plan?.assignments.find((a) => positionKey(a) === positionKey(editing));
  const currentBatch = current?.kind === 'meal' ? plan?.batches.find((b) => b.id === current.batchId) : undefined;
  const isOrigin = currentBatch && editing && positionKey(currentBatch.cookAt) === positionKey(editing);
  const leftovers = plan && editing ? plan.batches.filter((b) => positionOrder(b.cookAt) < positionOrder(editing) && batchRemaining(plan, b.id) + (current?.kind === 'meal' && current.batchId === b.id ? 2 : 0) >= 2) : [];
  const destinations = plan ? cookingDates(plan).flatMap((date) => plan.slots.map((slot) => ({ date, slot })))
    .filter((at) => !plan.assignments.some((a) => positionKey(a) === positionKey(at))) : [];
  const errorText = error ? t.cooking.errors[error as keyof typeof t.cooking.errors] ?? t.cooking.errors.server_error : null;
  const positionLabel = (at: Position) => `${parseDateKey(at.date).toLocaleDateString(t.intl, { day: 'numeric', month: 'short' })} · ${t.meals[at.slot]}`;

  async function act(action: CookingAction) {
    if (await mutate(action)) {
      setEditing(null);
      setCreating(false);
    }
  }
  function edit(at: Position) {
    clearError();
    setEditing(at);
    setDishId('');
    setBatchId('');
    setDestination('');
    const a = plan?.assignments.find((a) => positionKey(a) === positionKey(at));
    setServings(a?.kind === 'meal' ? plan?.batches.find((b) => b.id === a.batchId)?.servings ?? 2 : 2);
  }
  const creationForm = <form onSubmit={(e) => { e.preventDefault(); void act({ type: 'create', startDate, dayCount }); }} className="space-y-4">
    {plan && <p>{t.cooking.confirmNew}</p>}
    <label className="block space-y-1"><span>{t.cooking.startDate}</span><input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} /></label>
    <label className="block space-y-1"><span>{t.cooking.days}</span><select value={dayCount} onChange={(e) => setDayCount(Number(e.target.value) as 3 | 5 | 7)} className={field}>{[3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    <Button disabled={busy}>{busy ? t.cooking.saving : t.cooking.create}</Button>
  </form>;

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-display text-2xl font-extrabold">{t.cooking.title}</h1><p className="mt-1 text-sm text-latte">{t.cooking.subtitle}</p></div>
      {plan && <Button variant="secondary" disabled={busy} onClick={() => { clearError(); setCreating(true); }}>{t.cooking.newPlan}</Button>}
    </header>
    {errorText && !editing && !creating && <p role="alert" className="rounded-xl bg-peach p-3 font-semibold">{errorText}</p>}
    {!plan && <div className="max-w-md rounded-3xl border-2 border-ink bg-paper p-5">{creationForm}</div>}
    <div className="text-sm">
      {!loading && ready.length === 0 && <p>{t.cooking.noRecipes}</p>}
      <Link href="/dashboard/dishes" className="font-bold text-tomato underline">{t.cooking.setupRecipes}</Link>
    </div>
    {plan && <>
      <section className="space-y-3 rounded-3xl border-2 border-sand bg-paper p-4">
        <p className="text-sm">{t.cooking.generateHint}</p>
        {ready.some((d) => d.classification === 'experimental') && <fieldset disabled={busy} className="space-y-2">
          <legend className="mb-2 font-bold">{t.cooking.experiments}</legend>
          {ready.filter((d) => d.classification === 'experimental').map((d) => <label key={d.id} className="mr-4 inline-flex items-center gap-2">
            <input type="checkbox" checked={experiments.includes(d.id)} disabled={!experiments.includes(d.id) && experiments.length >= 3} onChange={(e) => setExperiments((ids) => e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id))} />{d.name}
          </label>)}
          <Button variant="ghost" onClick={() => setEditing(null)}>{t.common.close}</Button>
      </fieldset>}
        <Button disabled={busy || loading || ready.length === 0 || plan.assignments.length === plan.dayCount * plan.slots.length} onClick={() => void generate(experiments)}>{busy ? t.cooking.generating : t.cooking.generate}</Button>
      </section>
      {!busy && <details className="rounded-2xl border-2 border-sand p-4"><summary className="cursor-pointer font-bold">{t.pins.templateTitle}</summary><div className="mt-4"><WeekTemplate shared /></div></details>}
      <CookingWeekView plan={plan} onEdit={edit} disabled={busy} />
      <p className="text-sm text-latte">{t.cooking.planned}</p>
      <Link href="/dashboard/ingredients" className="inline-block font-bold text-tomato underline">{t.ingredients.title}</Link>
    </>}
    <Modal open={creating} onClose={() => { if (!busy) setCreating(false); }}>
      {creationForm}
      <Button variant="ghost" disabled={busy} onClick={() => setCreating(false)}>{t.common.cancel}</Button>
      {errorText && <p role="alert" className="mt-3 text-tomato">{errorText}</p>}
    </Modal>
    <Modal open={editing !== null} onClose={() => { if (!busy) setEditing(null); }} labelledBy="cooking-edit-title">
      {editing && <fieldset disabled={busy} className="space-y-5">
        <h2 id="cooking-edit-title" className="font-display text-lg font-extrabold">{positionLabel(editing)}</h2>
        {errorText && <p role="alert" className="text-tomato">{errorText}</p>}
        <form onSubmit={(e) => { e.preventDefault(); void act({ type: 'cook', at: editing, dishId, servings }); }} className="space-y-3">
          <label className="block"><span className="font-bold">{t.cooking.recipe}</span><select required className={field} value={dishId} onChange={(e) => { setDishId(e.target.value); setServings(Math.max(2, ready.find((d) => d.id === e.target.value)?.recipeServings ?? 2)); }}>
            <option value="">{t.cooking.recipe}</option>{ready.map((d) => <option key={d.id} value={d.id}>{d.name}{d.classification === 'experimental' ? ` · ${t.cooking.experimental}` : ''}</option>)}
          </select></label>
          <label className="block"><span>{t.cooking.servings}</span><input required type="number" min={2} max={40} step={1} value={servings} onChange={(e) => setServings(Number(e.target.value))} className={field} /></label>
          <div className="flex flex-wrap gap-2"><Button disabled={!dishId}>{t.cooking.cook}</Button>{isOrigin && <Button type="button" variant="secondary" disabled={!Number.isInteger(servings) || servings < 2 || servings > 40} onClick={() => void act({ type: 'resize', batchId: currentBatch.id, servings })}>{t.cooking.save}</Button>}</div>
        </form>
        <form onSubmit={(e) => { e.preventDefault(); void act({ type: 'reuse', at: editing, batchId }); }} className="space-y-2">
          {leftovers.length ? <><label className="block"><span>{t.cooking.source}</span><select required value={batchId} onChange={(e) => setBatchId(e.target.value)} className={field}>
            <option value="">{t.cooking.source}</option>{leftovers.map((b) => <option key={b.id} value={b.id}>{b.recipe.name} · {positionLabel(b.cookAt)}</option>)}
          </select></label><Button variant="secondary" disabled={!batchId}>{t.cooking.reuse}</Button></> : <p className="text-sm text-latte">{t.cooking.noLeftovers}</p>}
        </form>
        {current && destinations.length > 0 && <form onSubmit={(e) => { e.preventDefault(); const to = destinations.find((at) => positionKey(at) === destination); if (to) void act({ type: 'move', from: editing, to }); }} className="space-y-2">
          <label className="block"><span>{t.cooking.destination}</span><select required value={destination} onChange={(e) => setDestination(e.target.value)} className={field}><option value="">{t.cooking.destination}</option>{destinations.map((at) => <option key={positionKey(at)} value={positionKey(at)}>{positionLabel(at)}</option>)}</select></label>
          <Button variant="secondary" disabled={!destination}>{t.cooking.move}</Button>
        </form>}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void act({ type: 'away', at: editing })}>{t.cooking.away}</Button>{current && <Button variant="ghost" onClick={() => void act({ type: 'remove', at: editing })}>{t.cooking.remove}</Button>}</div>
        <Button variant="ghost" onClick={() => setEditing(null)}>{t.common.close}</Button>
      </fieldset>}
    </Modal>
  </section>;
}
