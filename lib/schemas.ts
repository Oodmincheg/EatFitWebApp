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

// What the client sends on onboarding finish. `calorieTarget` is NOT
// accepted from the client — the server recomputes it from raw inputs.
export const ProfileInputSchema = z.object({
  goal: GoalSchema,
  age: z.number().int().min(10).max(100),
  weightKg: z.number().min(30).max(300),
  heightCm: z.number().min(100).max(250),
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  ingredients: z.string().max(2000),
  dietaryTags: z.array(DietaryTagSchema),
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ProfileSchema = ProfileInputSchema.extend({
  calorieTarget: z.number(),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

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

export const DayPlanSchema = z.object({
  day: DayNameSchema,
  meals: z.object({
    breakfast: MealSchema,
    lunch: MealSchema,
    dinner: MealSchema,
  }),
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
  meals: z.object({
    breakfast: ModelMealSchema,
    lunch: ModelMealSchema,
    dinner: ModelMealSchema,
  }),
});
export const ModelPlanSchema = z.object({
  days: z.array(ModelDayPlanSchema).length(7),
});

// Stored/UI-facing plan: macros optional (legacy plans lack them).
export const MealPlanSchema = z.object({
  days: z.array(DayPlanSchema).length(7),
  generatedAt: z.string(),
  // Local date of days[0]. Plans now start on the day they were generated;
  // legacy plans lack this and are Monday-anchored (see planStart in dates.ts).
  startDate: DateKeySchema.optional(),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

export const GeneratePlanBodySchema = z.object({
  startDate: DateKeySchema.optional(),
});

// Single-day regeneration: what the model must return (the day name and
// totals are assigned server-side).
export const ModelDaySchema = z.object({
  meals: z.object({
    breakfast: ModelMealSchema,
    lunch: ModelMealSchema,
    dinner: ModelMealSchema,
  }),
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
export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner']);
export type MealSlot = z.infer<typeof MealSlotSchema>;
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

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

export const SilpoProductSchema = z.object({
  productId: z.string().min(1),
  companyId: z.string().min(1),
  branchId: z.string().min(1),
  slug: z.string(),
  title: z.string(),
  price: z.number().nonnegative(),
  oldPrice: z.number().nullable(),
  weighted: z.boolean(),
  step: z.number().nonnegative(),
  displayRatio: z.string().nullable(),
  stock: z.number().nonnegative(),
  img: z.string().nullable(),
  webUrl: z.string(),
});
export type SilpoProduct = z.infer<typeof SilpoProductSchema>;

export const SilpoCartLineSchema = z.object({
  query: z.string(),
  uaQuery: z.string(),
  neededGrams: z.number().nonnegative(),
  product: SilpoProductSchema.nullable(),
  candidates: z.array(SilpoProductSchema).optional(),
  quantity: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
});
export type SilpoCartLine = z.infer<typeof SilpoCartLineSchema>;

export const SilpoCartSchema = z.object({
  cartId: z.string(),
  branchId: z.string(),
  deliveryType: z.string(),
  timeslot: z.object({ start: z.string(), end: z.string(), stale: z.boolean() }),
  delivery: z.object({ minOrderCost: z.number(), deliveryCost: z.number().nullable() }),
  lines: z.array(SilpoCartLineSchema),
  matchedCount: z.number(),
  total: z.number(),
});
export type SilpoCart = z.infer<typeof SilpoCartSchema>;

export const SilpoValidationSchema = z.object({
  level: z.string(),
  type: z.string(),
  message: z.string(),
});
export type SilpoValidation = z.infer<typeof SilpoValidationSchema>;

export const SilpoLoyaltySchema = z.object({
  bonusAvailable: z.number(),
  bonusTotal: z.number(),
  bonusRequested: z.number().nullable(),
  isEnabled: z.boolean(),
});
export type SilpoLoyalty = z.infer<typeof SilpoLoyaltySchema>;

export const SilpoCommitResultSchema = z.object({
  cartId: z.string(),
  total: z.number(),
  totalAfterDiscounts: z.number(),
  itemCount: z.number(),
  validations: z.array(SilpoValidationSchema),
  loyalty: SilpoLoyaltySchema.nullable(),
  checkoutWebLink: z.string().nullable(),
  checkoutMobileLink: z.string().nullable(),
});
export type SilpoCommitResult = z.infer<typeof SilpoCommitResultSchema>;

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
  grams: number; // total weight needed across the week (0 = unknown)
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
