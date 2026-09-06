import { z } from 'zod';

// zod views of the Silpo MCP tool results we read (see docs/silpo-tools.json
// for the full outputSchema of each tool). Loose objects: the server adds
// fields between versions and we only need these.

export const MyCartResult = z.object({
  success: z.boolean(),
  exists: z.boolean(),
  shoppingCartId: z.string().nullable().optional(),
});

export const TimeslotSchema = z.object({ start: z.string(), end: z.string() });

export const ValidationSchema = z.looseObject({
  level: z.string(),
  type: z.string(),
  message: z.string(),
});

export const CartByIdResult = z.object({
  success: z.boolean(),
  cart: z.looseObject({
    id: z.string(),
    deliveryType: z.string(),
    timeslot: TimeslotSchema.nullable().optional(),
    address: z.record(z.string(), z.unknown()).nullable().optional(),
    shipments: z.array(
      z.looseObject({
        companyId: z.string(),
        branchId: z.string(),
        products: z
          .array(z.looseObject({ productId: z.string(), quantity: z.number().optional() }))
          .optional(),
      })
    ),
    calculation: z
      .looseObject({
        total: z.number().optional(),
        totalAfterDiscounts: z.number().optional(),
        validations: z.array(ValidationSchema).optional(),
      })
      .nullable()
      .optional(),
  }),
  loyalty: z
    .object({
      bonusAvailable: z.number(),
      bonusTotal: z.number(),
      bonusRequested: z.number().nullable(),
      isEnabled: z.boolean(),
    })
    .nullable()
    .optional(),
  checkoutWebLink: z.string().nullable().optional(),
  checkoutMobileLink: z.string().nullable().optional(),
});

export const SlotsResult = z.object({
  success: z.boolean(),
  slots: z.array(
    z.looseObject({
      start: z.string(),
      end: z.string(),
      available: z.boolean(),
      deliveryCost: z.number().nullable().optional(),
      minOrderCost: z.number().optional(),
    })
  ),
});

export const ProductHitSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  price: z.number(),
  oldPrice: z.number().nullable().optional(),
  stock: z.number(),
  available: z.boolean(),
  image: z.string().nullable().optional(),
  weighted: z.boolean(),
  step: z.number(),
  displayRatio: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
});
export type ProductHit = z.infer<typeof ProductHitSchema>;

export const BatchSearchResult = z.object({
  success: z.boolean(),
  queries: z.array(
    z.object({
      query: z.string(),
      totalFound: z.number(),
      products: z.array(ProductHitSchema),
    })
  ),
});

export const WriteResult = z.looseObject({ success: z.boolean() });
