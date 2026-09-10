import { z } from 'zod';

// ── Profile ─────────────────────────────────────────────────
export const GoalSchema = z.enum(['weight_loss', 'maintenance', 'muscle_gain']);
export const SexSchema = z.enum(['male', 'female']);
export const ActivityLevelSchema = z.enum(['sedentary', 'light', 'moderate', 'active']);
export const DietaryTagSchema = z.enum([
  'lactose_free',
  'vegan',
  'vegetarian',
  'gluten_free',
  'nut_allergy',
]);

export type Goal = z.infer<typeof GoalSchema>;
export type Sex = z.infer<typeof SexSchema>;
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>;
export type DietaryTag = z.infer<typeof DietaryTagSchema>;

// How a pantry amount is entered. Everything but pieces converts to grams
// for the shopping-list subtraction; millilitres are counted as grams, which
// is right for water-like staples and close enough for milk or oil.
export const PANTRY_UNITS = ['g', 'kg', 'ml', 'l', 'pc'] as const;
export const PantryUnitSchema = z.enum(PANTRY_UNITS);
export type PantryUnit = z.infer<typeof PantryUnitSchema>;

const UNIT_GRAMS: Record<PantryUnit, number | null> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  pc: null, // a count says nothing about weight
};

// One line of the pantry. An item with no amount — or one counted in pieces —
// is treated as "enough of it", the way the old free-text list behaved.
export const PantryItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amount: z.number().nonnegative().max(100_000).optional(),
  unit: PantryUnitSchema.optional(),
  // Written by versions before units existed; read, never written.
  grams: z.number().nonnegative().max(100_000).optional(),
});
export type PantryItem = z.infer<typeof PantryItemSchema>;

// The weight this row covers, or null when it covers the item outright.
export function pantryGrams(item: PantryItem): number | null {
  if (item.amount === undefined) return item.grams ?? null;
  const factor = UNIT_GRAMS[item.unit ?? 'g'];
  return factor === null ? null : item.amount * factor;
}

// Meal slots in fixed daily order; `mealSlots` on the profile picks which of
// them a generated day carries (breakfast, lunch and dinner by default).
export const MealSlotSchema = z.enum([
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
]);
export type MealSlot = z.infer<typeof MealSlotSchema>;
export const MEAL_SLOTS: MealSlot[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
];
export const DEFAULT_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export const PLAN_DAY_OPTIONS = [3, 5, 7] as const;
export const PlanDaysSchema = z.union([z.literal(3), z.literal(5), z.literal(7)]);
export const DEFAULT_PLAN_DAYS = 7;

// Slots in their canonical daily order, deduplicated.
export function orderSlots(slots: MealSlot[]): MealSlot[] {
  return MEAL_SLOTS.filter((slot) => slots.includes(slot));
}

// What the client sends on onboarding finish. `calorieTarget` is NOT
// accepted from the client — the server recomputes it from raw inputs,
// unless `calorieTargetOverride` sets it by hand.
export const ProfileInputSchema = z.object({
  goal: GoalSchema,
  age: z.number().int().min(10).max(100),
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(100).max(250),
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  pantry: z.array(PantryItemSchema).max(120).default([]),
  dietaryTags: z.array(DietaryTagSchema),
  // null = back to the computed target.
  calorieTargetOverride: z.number().int().min(800).max(6000).nullable().optional(),
  mealSlots: z.array(MealSlotSchema).min(2).max(5).optional(),
  planDays: PlanDaysSchema.optional(),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ProfileSchema = ProfileInputSchema.extend({
  // Derived from `pantry` on every write; the LLM prompt and the owned-item
  // matching read this one string.
  ingredients: z.string().max(4000),
  calorieTarget: z.number(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PantryBodySchema = z.object({
  pantry: z.array(PantryItemSchema).max(120),
});

// Local calendar date, e.g. "2026-07-10".
export const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── Meal plan (AI output, schema-enforced) ──────────────────
export const IngredientSchema = z.object({
  name: z.string().min(1),
  grams: z.number().nonnegative(), // weight used in this dish
});
export type Ingredient = z.infer<typeof IngredientSchema>;

// Macros are optional here because plans stored before macros existed lack
// them; fresh model output must include them (see ModelMealSchema below).
export const MealSchema = z.object({
  name: z.string().min(1),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative().optional(),
  fat_g: z.number().nonnegative().optional(),
  carbs_g: z.number().nonnegative().optional(),
  ingredients: z.array(IngredientSchema),
  // Set when the slot holds one of the user's own dishes (pinned).
  dishId: z.string().optional(),
});
export type Meal = z.infer<typeof MealSchema>;

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const DayNameSchema = z.enum(DAY_NAMES);
export type DayName = z.infer<typeof DayNameSchema>;

// The slots a stored day actually carries, in daily order. Days generated
// before snacks existed carry exactly breakfast/lunch/dinner.
export function daySlots(day: { meals: Partial<Record<MealSlot, Meal>> }): MealSlot[] {
  return MEAL_SLOTS.filter((slot) => day.meals[slot]);
}

export const DayPlanSchema = z.object({
  day: DayNameSchema,
  // Which slots a day carries follows the profile, so the record is partial;
  // `daySlots()` returns the ones actually present, in daily order.
  meals: z.partialRecord(MealSlotSchema, MealSchema),
  total_kcal: z.number(),
  // Server-computed sums of the meals' macros (absent on legacy plans).
  total_protein_g: z.number().optional(),
  total_fat_g: z.number().optional(),
  total_carbs_g: z.number().optional(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

// What the model must return (generatedAt is added server-side). Fresh
// output must carry macros on every meal; stored plans may not.
export const ModelMealSchema = MealSchema.omit({ dishId: true }).required({
  protein_g: true,
  fat_g: true,
  carbs_g: true,
});
export type ModelMeal = z.infer<typeof ModelMealSchema>;
const ModelDayPlanSchema = DayPlanSchema.extend({
  meals: z.partialRecord(MealSlotSchema, ModelMealSchema),
});
export const ModelPlanSchema = z.object({
  days: z.array(ModelDayPlanSchema).min(1).max(7),
});

// Stored/UI-facing plan: macros optional (legacy plans lack them).
export const MealPlanSchema = z.object({
  days: z.array(DayPlanSchema).min(1).max(7),
  generatedAt: z.string(),
  // Local date of days[0]. Plans now start on the day they were generated;
  // legacy plans lack this and are Monday-anchored (see planStart in dates.ts).
  startDate: DateKeySchema.optional(),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

export const GeneratePlanBodySchema = z.object({
  startDate: DateKeySchema.optional(),
});

// The generate-plan stream is a boundary like any other: the route builds
// these events and the client validates every line before it touches state.
export const PlanStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    totalDays: z.number().int().min(1).max(7),
    startDate: DateKeySchema,
  }),
  z.object({ type: z.literal('day'), index: z.number().int().min(0).max(6), day: DayPlanSchema }),
  z.object({ type: z.literal('done'), plan: MealPlanSchema }),
  z.object({ type: z.literal('error'), error: z.string(), partial: z.boolean() }),
]);
export type PlanStreamEvent = z.infer<typeof PlanStreamEventSchema>;

// Single-day regeneration: what the model must return (the day name and
// totals are assigned server-side).
export const ModelDaySchema = z.object({
  meals: z.partialRecord(MealSlotSchema, ModelMealSchema),
});

// Replace a single slot of one day, keeping the rest of that day.
export const RegenerateMealBodySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  slot: MealSlotSchema,
  preference: z.string().max(300).optional(),
  today: DateKeySchema.optional(),
});

export const RegenerateDayBodySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  // Free-text wish for the day ("something with fish", "lighter dinner").
  preference: z.string().max(300).optional(),
  // The client's local date — only today/future days may be regenerated.
  today: DateKeySchema.optional(),
});

// Fridge photo scan: a base64 data URL. The client downscales to ≤1024px
// JPEG before uploading, so 4 MB leaves plenty of headroom.
export const ParseFridgeBodySchema = z.object({
  image: z
    .string()
    .max(4 * 1024 * 1024)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
});

// ── Day progress (meals checked off as eaten) ───────────────

// ── User dishes (own recipes with known kcal and macros) ────
export const DishInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kcal: z.number().nonnegative().max(5000),
  protein_g: z.number().nonnegative().max(1000),
  fat_g: z.number().nonnegative().max(1000),
  carbs_g: z.number().nonnegative().max(1000),
  ingredients: z
    .array(z.object({ name: z.string().trim().min(1).max(80), grams: z.number().nonnegative().max(10_000) }))
    .max(40),
});
export type DishInput = z.infer<typeof DishInputSchema>;

// Client-facing dish (id is the Mongo ObjectId as hex).
export interface Dish extends DishInput {
  id: string;
  createdAt: string;
}

// Ask the model for kcal and macros of a dish from its ingredient list.
export const DishEstimateBodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  ingredients: z
    .array(z.object({ name: z.string().trim().min(1).max(80), grams: z.number().positive().max(10_000) }))
    .min(1)
    .max(40),
});
export const DishEstimateSchema = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
});
export type DishEstimate = z.infer<typeof DishEstimateSchema>;

// ── Pinned slots: a weekly template of the user's dishes ────
// pins[day][slot] = dish id. Generation fills only the unpinned slots.
export const PinsSchema = z.partialRecord(DayNameSchema, z.partialRecord(MealSlotSchema, z.string()));
export type Pins = z.infer<typeof PinsSchema>;

export const PinBodySchema = z.object({
  day: DayNameSchema,
  slot: MealSlotSchema,
  dishId: z.string().min(1).nullable(), // null = unpin
  // The client's local date; the current plan is only patched for today/future days.
  today: DateKeySchema.optional(),
});

export const DayProgressSchema = z.object({
  date: DateKeySchema,
  eaten: z.array(MealSlotSchema),
});
export type DayProgress = z.infer<typeof DayProgressSchema>;

export const ToggleProgressBodySchema = z.object({
  date: DateKeySchema,
  slot: MealSlotSchema,
  eaten: z.boolean(),
});

// ── Grocery orders (cart status lifecycle) ──────────────────
export const OrderStatusSchema = z.enum(['ordered', 'delivered']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderItemSchema = z.object({
  name: z.string().min(1).max(200),
  grams: z.number().nonnegative(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const CreateOrderBodySchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(200),
});

export const UpdateOrderBodySchema = z.object({
  status: OrderStatusSchema,
});

// ── Silpo real cart (official MCP; matched, then written to the user's cart) ──
export const SilpoCartBodySchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(60),
});

export const SilpoCommitBodySchema = z.object({
  cartId: z.string().min(1),
  // Present when the cart's own delivery slot had expired; commit writes it first.
  timeslot: z.object({ start: z.string(), end: z.string() }).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        companyId: z.string().min(1),
        branchId: z.string().min(1),
        quantity: z.number().positive(),
      })
    )
    .min(1)
    .max(60),
});
export type SilpoCommitBody = z.infer<typeof SilpoCommitBodySchema>;

export interface SilpoProduct {
  productId: string;
  companyId: string;
  branchId: string;
  slug: string;
  title: string; // Ukrainian, from the catalog
  price: number; // UAH; per kg when weighted, per pack otherwise
  oldPrice: number | null; // UAH, set when discounted
  weighted: boolean;
  step: number; // kg increment when weighted, else 1
  displayRatio: string | null; // pack content, e.g. "400г", "10шт"
  stock: number; // kg when weighted, packs otherwise
  img: string | null;
  webUrl: string;
}

export interface SilpoCartLine {
  query: string; // English source name
  uaQuery: string; // what was searched on Silpo (for the manual-search fallback)
  neededGrams: number; // 0 = unknown
  product: SilpoProduct | null;
  quantity: number; // kg when weighted, packs otherwise
  lineTotal: number; // UAH
}

export interface SilpoCart {
  cartId: string;
  branchId: string;
  deliveryType: string;
  // The slot the searches ran against. `stale` = the cart's own slot had
  // expired and this replacement must be written on commit.
  timeslot: { start: string; end: string; stale: boolean };
  delivery: { minOrderCost: number; deliveryCost: number | null };
  lines: SilpoCartLine[];
  matchedCount: number;
  total: number; // UAH, Σ lineTotal
}

export interface SilpoValidation {
  level: string; // "error" | "warning" | "info"
  type: string;
  message: string;
}

export interface SilpoLoyalty {
  bonusAvailable: number;
  bonusTotal: number;
  bonusRequested: number | null;
  isEnabled: boolean;
}

export interface SilpoCommitResult {
  cartId: string;
  total: number;
  totalAfterDiscounts: number;
  itemCount: number;
  validations: SilpoValidation[];
  loyalty: SilpoLoyalty | null;
  checkoutWebLink: string | null;
  checkoutMobileLink: string | null;
}

// Client-facing order shape (id is the Mongo ObjectId as hex).
export interface Order {
  id: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  deliveredAt?: string;
}

// ── Session API bodies ──────────────────────────────────────
export const SessionBodySchema = z.object({
  idToken: z.string().optional(),
});

// ── Derived (never persisted) ───────────────────────────────
export type ShoppingCategory =
  | 'produce'
  | 'meat-fish'
  | 'dairy-eggs'
  | 'grains'
  | 'pantry'
  | 'other';

export interface ShoppingItem {
  name: string;
  grams: number; // still to buy across the week (0 = unknown)
  haveGrams?: number; // already covered by a weighed pantry row
  usedIn: string[];
  category: ShoppingCategory;
}

// Plans stored before ingredients carried weights have plain string
// ingredients — coerce them to { name, grams: 0 } so old data still renders.
export function coerceStoredPlan(plan: MealPlan): MealPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      meals: Object.fromEntries(
        Object.entries(day.meals).map(([slot, meal]) => [
          slot,
          {
            ...meal,
            ingredients: meal.ingredients.map((ing) =>
              typeof ing === 'string' ? { name: ing, grams: 0 } : ing
            ),
          },
        ])
      ) as DayPlan['meals'],
    })),
  };
}

// ── Client-facing session/user shape ────────────────────────
export type Session =
  | { kind: 'google'; uid: string; displayName: string; email: string }
  | { kind: 'guest'; uid: string };
