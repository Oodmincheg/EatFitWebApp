import 'server-only';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  OrderItem,
  SilpoCart,
  SilpoCartLine,
  SilpoCommitBody,
  SilpoCommitResult,
  SilpoProduct,
} from '../schemas';
import { SilpoToolError, callTool, withSilpo } from './client';
import {
  BatchSearchResult,
  CartByIdResult,
  MyCartResult,
  SlotsResult,
  WriteResult,
  type ProductHit,
} from './tools';
import { choosePicks, resolveQueries, suggestQuantity, type PickItem } from './match';

// The account has no cart yet: delivery address and slot must be set up in
// the Silpo app first (silpo_create_shopping_cart is not wired in EatFit).
export class SilpoNoCartError extends Error {}

const SEARCH_LIMIT = 6;
const BATCH_SIZE = 30; // silpo_find_products_batch maxItems
const PRODUCT_URL = 'https://silpo.ua/product/';

type Ctx = { branchId: string; deliveryType: string; timeslotStart: string; timeslotEnd: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadCart(client: Client) {
  const mine = await callTool(client, 'silpo_get_my_shopping_cart', {}, MyCartResult);
  if (!mine.exists || !mine.shoppingCartId) throw new SilpoNoCartError('no_cart');
  const res = await callTool(
    client,
    'silpo_get_shopping_cart_by_id',
    { shoppingCartId: mine.shoppingCartId },
    CartByIdResult
  );
  const shipment = res.cart.shipments[0];
  if (!shipment) throw new SilpoToolError('cart has no shipment');
  return { cartId: mine.shoppingCartId, res, shipment };
}

// The cart's slot expires between sessions, and searching against an expired
// slot silently returns zero products, so resolve a live slot first.
// (`start` in silpo_get_time_slots 400s on this server; omit it.)
async function resolveSlot(
  client: Client,
  branchId: string,
  deliveryType: string,
  current: { start: string; end: string } | undefined
) {
  const { slots } = await callTool(
    client,
    'silpo_get_time_slots',
    { branchId, deliveryTypes: [deliveryType], limit: 25 },
    SlotsResult
  );
  const same = current
    ? slots.find((s) => s.start === current.start && s.end === current.end && s.available)
    : undefined;
  const slot = same ?? slots.find((s) => s.available);
  if (!slot) throw new SilpoToolError('no delivery slots available');
  return { slot, stale: !same };
}

function toProduct(hit: ProductHit): SilpoProduct | null {
  if (!hit.available || hit.stock <= 0 || !hit.companyId || !hit.branchId) return null;
  return {
    productId: hit.id,
    companyId: hit.companyId,
    branchId: hit.branchId,
    slug: hit.slug,
    title: hit.name,
    price: hit.price,
    oldPrice: hit.oldPrice ?? null,
    weighted: hit.weighted,
    step: hit.step,
    displayRatio: hit.displayRatio ?? null,
    stock: hit.stock,
    img: hit.image ?? null,
    webUrl: `${PRODUCT_URL}${hit.slug}`,
  };
}

// Orderable candidates per Ukrainian query, in search-relevance order. A
// failed batch degrades to "no candidates" for its queries, never throws.
async function searchAll(
  client: Client,
  ctx: Ctx,
  uaQueries: string[]
): Promise<Map<string, SilpoProduct[]>> {
  const unique = [...new Set(uaQueries)];
  const out = new Map<string, SilpoProduct[]>();
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    try {
      const res = await callTool(
        client,
        'silpo_find_products_batch',
        { ...ctx, products: chunk, limit: SEARCH_LIMIT },
        BatchSearchResult
      );
      for (const q of res.queries) {
        out.set(
          q.query,
          q.products.map(toProduct).filter((p): p is SilpoProduct => p !== null)
        );
      }
    } catch (e) {
      if (!(e instanceof SilpoToolError)) throw e;
      chunk.forEach((q) => out.set(q, []));
    }
  }
  return out;
}

export function buildCart(uid: string, origin: string, items: OrderItem[]): Promise<SilpoCart> {
  return withSilpo(uid, origin, async (client) => {
    const { cartId, res, shipment } = await loadCart(client);
    const { slot, stale } = await resolveSlot(
      client,
      shipment.branchId,
      res.cart.deliveryType,
      res.cart.timeslot ?? undefined
    );
    const ctx: Ctx = {
      branchId: shipment.branchId,
      deliveryType: res.cart.deliveryType,
      timeslotStart: slot.start,
      timeslotEnd: slot.end,
    };

    const queries = await resolveQueries(items.map((i) => i.name));
    const results = await searchAll(client, ctx, items.map((i) => queries[i.name].query));
    const candidatesOf = (item: OrderItem) => results.get(queries[item.name].query) ?? [];

    // Every item with at least one hit goes to the LLM: a lone candidate can
    // still be a lookalike (cat food for "chicken"), and -1 drops it.
    const picks = await choosePicks(
      items
        .map(
          (item): PickItem => ({
            name: item.name,
            grams: item.grams,
            category: queries[item.name].category,
            candidates: candidatesOf(item).map((p) => ({
              title: p.title,
              price: p.price,
              weighted: p.weighted,
              displayRatio: p.displayRatio,
              oldPrice: p.oldPrice,
            })),
          })
        )
        .filter((it) => it.candidates.length > 0)
    );

    const lines = items.map((item): SilpoCartLine => {
      const candidates = candidatesOf(item);
      const pick = picks[item.name];
      const product =
        (pick === undefined ? candidates[0] : pick === -1 ? null : candidates[pick]) ?? null;
      const quantity = product ? suggestQuantity(item.grams, product) : 0;
      return {
        query: item.name,
        uaQuery: queries[item.name].query,
        neededGrams: item.grams,
        product,
        quantity,
        lineTotal: product ? round2(product.price * quantity) : 0,
      };
    });
    const matched = lines.filter((l) => l.product);

    return {
      cartId,
      branchId: ctx.branchId,
      deliveryType: ctx.deliveryType,
      timeslot: { start: slot.start, end: slot.end, stale },
      delivery: { minOrderCost: slot.minOrderCost ?? 0, deliveryCost: slot.deliveryCost ?? null },
      lines,
      matchedCount: matched.length,
      total: round2(matched.reduce((sum, l) => sum + l.lineTotal, 0)),
    };
  });
}

// Writes the reviewed lines into the user's real Silpo cart (quantities
// replace, so re-committing is idempotent), fixing the delivery slot first
// when the build found it expired. Returns the server's own totals and
// validations; the user pays on silpo.ua via checkoutWebLink.
export function commitCart(
  uid: string,
  origin: string,
  body: SilpoCommitBody
): Promise<SilpoCommitResult> {
  return withSilpo(uid, origin, async (client) => {
    if (body.timeslot) {
      const current = await callTool(
        client,
        'silpo_get_shopping_cart_by_id',
        { shoppingCartId: body.cartId },
        CartByIdResult
      );
      await callTool(
        client,
        'silpo_update_shopping_cart',
        {
          shoppingCartId: body.cartId,
          deliveryType: current.cart.deliveryType,
          timeslot: body.timeslot,
          address: current.cart.address ?? {},
          shipments: current.cart.shipments.map((s) => ({
            companyId: s.companyId,
            branchId: s.branchId,
          })),
        },
        WriteResult
      );
    }

    await callTool(
      client,
      'silpo_add_or_update_cart_products',
      {
        shoppingCartId: body.cartId,
        products: body.lines.map((l) => ({ ...l, addQuantity: false })),
      },
      WriteResult
    );

    const final = await callTool(
      client,
      'silpo_get_shopping_cart_by_id',
      { shoppingCartId: body.cartId },
      CartByIdResult
    );
    const calc = final.cart.calculation;
    return {
      cartId: body.cartId,
      total: calc?.total ?? 0,
      totalAfterDiscounts: calc?.totalAfterDiscounts ?? calc?.total ?? 0,
      itemCount: final.cart.shipments.reduce((n, s) => n + (s.products?.length ?? 0), 0),
      validations: (calc?.validations ?? []).map(({ level, type, message }) => ({
        level,
        type,
        message,
      })),
      loyalty: final.loyalty ?? null,
      checkoutWebLink: final.checkoutWebLink ?? null,
      checkoutMobileLink: final.checkoutMobileLink ?? null,
    };
  });
}
