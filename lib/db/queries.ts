import { ObjectId } from 'mongodb';
import { randomUUID } from 'crypto';
import { getDb } from './client';
import {
  coerceStoredPlan,
  type DayName,
  type DayProgress,
  type Dish,
  type DishInput,
  type MealPlan,
  type MealSlot,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PantryItem,
  type Pins,
  type Profile,
} from '../schemas';
import { coerceProfile, pantryToIngredients } from '../profile';

// users collection — _id is the mp_uid cookie value
export interface UserDoc {
  _id: string; // UUID
  kind: 'google' | 'guest';
  firebaseUid?: string;
  email?: string;
  displayName?: string;
  profile?: Profile;
  pins?: Pins; // weekly template of the user's dishes per day/slot
  createdAt: string;
}

export interface DishDoc extends DishInput {
  _id: ObjectId;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDoc {
  _id: ObjectId;
  userId: string;
  plan: MealPlan;
  generatedAt: string;
}

// One document per user per calendar date — which meal slots were eaten.
export interface ProgressDoc {
  _id: string; // `${userId}:${date}` — natural key, makes upserts race-safe
  userId: string;
  date: string; // "YYYY-MM-DD" local date
  eaten: MealSlot[];
}

export interface OrderDoc {
  _id: ObjectId;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  deliveredAt?: string;
}

async function users() {
  return (await getDb()).collection<UserDoc>('users');
}
async function plans() {
  return (await getDb()).collection<PlanDoc>('plans');
}
async function progress() {
  return (await getDb()).collection<ProgressDoc>('progress');
}
async function orders() {
  return (await getDb()).collection<OrderDoc>('orders');
}
async function dishes() {
  return (await getDb()).collection<DishDoc>('dishes');
}

export async function findUser(uid: string): Promise<UserDoc | null> {
  const user = await (await users()).findOne({ _id: uid });
  return user?.profile ? { ...user, profile: coerceProfile(user.profile) } : user;
}

export async function createGuestUser(): Promise<UserDoc> {
  const doc: UserDoc = {
    _id: randomUUID(),
    kind: 'guest',
    createdAt: new Date().toISOString(),
  };
  await (await users()).insertOne(doc);
  return doc;
}

// Google sign-in: find by firebaseUid; if a guest session already exists on
// this device, upgrade that document so onboarding data done as a guest is kept.
export async function findOrCreateGoogleUser(
  google: { firebaseUid: string; email: string; displayName: string },
  existingUid?: string
): Promise<UserDoc> {
  const col = await users();

  const existing = await col.findOne({ firebaseUid: google.firebaseUid });
  if (existing) return existing;

  if (existingUid) {
    const guest = await col.findOne({ _id: existingUid, kind: 'guest' });
    if (guest) {
      const upgraded = await col.findOneAndUpdate(
        { _id: existingUid },
        {
          $set: {
            kind: 'google' as const,
            firebaseUid: google.firebaseUid,
            email: google.email,
            displayName: google.displayName,
          },
        },
        { returnDocument: 'after' }
      );
      if (upgraded) return upgraded;
    }
  }

  const doc: UserDoc = {
    _id: randomUUID(),
    kind: 'google',
    firebaseUid: google.firebaseUid,
    email: google.email,
    displayName: google.displayName,
    createdAt: new Date().toISOString(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function upsertProfile(uid: string, profile: Profile): Promise<boolean> {
  const res = await (await users()).updateOne({ _id: uid }, { $set: { profile } });
  return res.matchedCount > 0;
}

// Pantry edits must not touch `createdAt` — that timestamp is what marks a
// plan as generated under older settings.
export async function updatePantry(uid: string, pantry: PantryItem[]): Promise<Profile | null> {
  const doc = await (await users()).findOneAndUpdate(
    { _id: uid, profile: { $exists: true } },
    { $set: { 'profile.pantry': pantry, 'profile.ingredients': pantryToIngredients(pantry) } },
    { returnDocument: 'after' }
  );
  return doc?.profile ? coerceProfile(doc.profile) : null;
}

export async function latestPlan(uid: string): Promise<MealPlan | null> {
  const doc = await (await plans())
    .find({ userId: uid })
    .sort({ generatedAt: -1 })
    .limit(1)
    .next();
  return doc ? coerceStoredPlan(doc.plan) : null;
}

export async function insertPlan(uid: string, plan: MealPlan): Promise<void> {
  await (await plans()).insertOne({
    _id: new ObjectId(),
    userId: uid,
    plan,
    generatedAt: plan.generatedAt,
  });
}

// Progressive generation writes the plan after every finished day, so a run
// that dies halfway still leaves the user with the days it managed.
export async function savePlanDoc(
  uid: string,
  planId: ObjectId,
  plan: MealPlan
): Promise<void> {
  await (await plans()).updateOne(
    { _id: planId },
    { $set: { userId: uid, plan, generatedAt: plan.generatedAt } },
    { upsert: true }
  );
}

// Overwrite the current (latest) plan in place — used by single-day
// regeneration, which edits the plan rather than producing a new one.
export async function replaceLatestPlan(uid: string, plan: MealPlan): Promise<boolean> {
  const doc = await (await plans()).findOneAndUpdate(
    { userId: uid },
    { $set: { plan } },
    { sort: { generatedAt: -1 }, returnDocument: 'after' }
  );
  return doc !== null;
}

// Plan history, newest first (the first entry is the current plan).
export async function listPlans(uid: string, limit = 12): Promise<MealPlan[]> {
  const docs = await (await plans())
    .find({ userId: uid })
    .sort({ generatedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => coerceStoredPlan(doc.plan));
}

// ── Day progress ────────────────────────────────────────────
export async function listProgress(
  uid: string,
  from: string,
  to: string
): Promise<DayProgress[]> {
  const docs = await (await progress())
    .find({ userId: uid, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .toArray();
  return docs.map(({ date, eaten }) => ({ date, eaten }));
}

export async function toggleProgress(
  uid: string,
  date: string,
  slot: MealSlot,
  eaten: boolean
): Promise<DayProgress> {
  const col = await progress();
  const update = eaten
    ? { $addToSet: { eaten: slot } as const }
    : { $pull: { eaten: slot } as const };
  const doc = await col.findOneAndUpdate(
    { _id: `${uid}:${date}` },
    { ...update, $setOnInsert: { userId: uid, date } },
    { upsert: true, returnDocument: 'after' }
  );
  return { date, eaten: doc?.eaten ?? (eaten ? [slot] : []) };
}

// ── Orders ──────────────────────────────────────────────────
function toOrder(doc: OrderDoc): Order {
  return {
    id: doc._id.toHexString(),
    items: doc.items,
    status: doc.status,
    createdAt: doc.createdAt,
    ...(doc.deliveredAt ? { deliveredAt: doc.deliveredAt } : {}),
  };
}

export async function listOrders(uid: string, limit = 20): Promise<Order[]> {
  const docs = await (await orders())
    .find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toOrder);
}

export async function createOrder(uid: string, items: OrderItem[]): Promise<Order> {
  const doc: OrderDoc = {
    _id: new ObjectId(),
    userId: uid,
    items,
    status: 'ordered',
    createdAt: new Date().toISOString(),
  };
  await (await orders()).insertOne(doc);
  return toOrder(doc);
}

export async function updateOrderStatus(
  uid: string,
  orderId: string,
  status: OrderStatus
): Promise<Order | null> {
  if (!ObjectId.isValid(orderId)) return null;
  const set: Partial<OrderDoc> = { status };
  if (status === 'delivered') set.deliveredAt = new Date().toISOString();
  const doc = await (await orders()).findOneAndUpdate(
    { _id: new ObjectId(orderId), userId: uid },
    { $set: set },
    { returnDocument: 'after' }
  );
  return doc ? toOrder(doc) : null;
}

// ── Dishes ──────────────────────────────────────────────────
function toDish(doc: DishDoc): Dish {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    kcal: doc.kcal,
    protein_g: doc.protein_g,
    fat_g: doc.fat_g,
    carbs_g: doc.carbs_g,
    ingredients: doc.ingredients,
    createdAt: doc.createdAt,
  };
}

export async function listDishes(uid: string): Promise<Dish[]> {
  const docs = await (await dishes()).find({ userId: uid }).sort({ createdAt: -1 }).toArray();
  return docs.map(toDish);
}

export async function getDish(uid: string, id: string): Promise<Dish | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await dishes()).findOne({ _id: new ObjectId(id), userId: uid });
  return doc ? toDish(doc) : null;
}

export async function createDish(uid: string, input: DishInput): Promise<Dish> {
  const now = new Date().toISOString();
  const doc: DishDoc = { _id: new ObjectId(), userId: uid, ...input, createdAt: now, updatedAt: now };
  await (await dishes()).insertOne(doc);
  return toDish(doc);
}

export async function updateDish(uid: string, id: string, input: DishInput): Promise<Dish | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await dishes()).findOneAndUpdate(
    { _id: new ObjectId(id), userId: uid },
    { $set: { ...input, updatedAt: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  return doc ? toDish(doc) : null;
}

export async function deleteDish(uid: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const res = await (await dishes()).deleteOne({ _id: new ObjectId(id), userId: uid });
  return res.deletedCount > 0;
}

// ── Pins ────────────────────────────────────────────────────
export async function getPins(uid: string): Promise<Pins> {
  const user = await (await users()).findOne({ _id: uid }, { projection: { pins: 1 } });
  return user?.pins ?? {};
}

export async function setPin(
  uid: string,
  day: DayName,
  slot: MealSlot,
  dishId: string | null
): Promise<Pins> {
  const path = `pins.${day}.${slot}`;
  const doc = await (await users()).findOneAndUpdate(
    { _id: uid },
    dishId ? { $set: { [path]: dishId } } : { $unset: { [path]: '' } },
    { returnDocument: 'after', projection: { pins: 1 } }
  );
  return doc?.pins ?? {};
}

export async function savePins(uid: string, pins: Pins): Promise<void> {
  await (await users()).updateOne({ _id: uid }, { $set: { pins } });
}
