// Read-only probes against the authenticated Silpo MCP: cart context, product
// search (English vs Ukrainian queries), one product card, promotions, time
// slots. Raw results go to the gitignored .silpo-probe.local.json; the console
// gets a compact summary. Never writes to the account.
//
//   node scripts/silpo-probe.mts
import { writeFileSync } from 'node:fs';
import { connectLocal, resultJson, ROOT } from './lib/silpoLocal.mts';

const PROBE_FILE = `${ROOT}.silpo-probe.local.json`;
const QUERIES = [
  'chicken breast',
  'куряче філе',
  'eggs',
  'яйця',
  'rice',
  'рис',
  'potato',
  'картопля',
  'tomatoes',
  'помідори',
];

type Json = Record<string, unknown>;
const raw: Record<string, unknown> = {};

const { client } = await connectLocal();
async function call(name: string, args: Record<string, unknown>): Promise<Json> {
  const res = await client.callTool({ name, arguments: args });
  const json = resultJson(res as { structuredContent?: unknown; content?: unknown }) as Json;
  raw[name] = json;
  return json;
}

const mine = await call('silpo_get_my_shopping_cart', {});
if (!mine.exists) {
  console.log('no cart on this account; create one in the Silpo app first');
  process.exit(0);
}
const cartRes = await call('silpo_get_shopping_cart_by_id', { shoppingCartId: mine.shoppingCartId });
const cart = cartRes.cart as Json;
const shipments = cart.shipments as Json[] | undefined;
const timeslot = cart.timeslot as Json | undefined;
const ctx = {
  branchId: String(shipments?.[0]?.branchId ?? ''),
  deliveryType: String(cart.deliveryType ?? ''),
  timeslotStart: String(timeslot?.start ?? ''),
  timeslotEnd: String(timeslot?.end ?? ''),
};
console.log('cart keys:', Object.keys(cart).join(', '));
console.log('shipments[0] keys:', Object.keys(shipments?.[0] ?? {}).join(', '));
console.log('calculation keys:', Object.keys((cart.calculation as Json) ?? {}).join(', '));
console.log('ctx:', ctx);
console.log('loyalty:', cartRes.loyalty, '| checkoutWebLink:', typeof cartRes.checkoutWebLink);

// The docs' own recipe (deliveryTypes + start) 400'd once; try the variants
// and keep the first that answers.
const slotVariants: Record<string, unknown>[] = [
  { branchId: ctx.branchId, deliveryTypes: [ctx.deliveryType], start: new Date().toISOString(), limit: 5 },
  { branchId: ctx.branchId, deliveryTypes: [ctx.deliveryType], limit: 5 },
  { branchId: ctx.branchId, limit: 5 },
];
let slotList: Json[] = [];
for (const args of slotVariants) {
  const slots = await call('silpo_get_time_slots', args);
  console.log(`\ntime slots ${JSON.stringify(Object.keys(args))}:`, slots.error ?? Object.keys(slots).join(', '));
  if (!slots.error) {
    slotList = (slots.slots as Json[] | undefined) ?? [];
    console.log('first slots:', JSON.stringify(slotList.slice(0, 2)));
    break;
  }
}
const cartSlotLive = slotList.some(
  (s) => s.start === ctx.timeslotStart && s.end === ctx.timeslotEnd && s.available
);
console.log('cart timeslot still offered:', cartSlotLive);

// Search with the cart's own slot first. A stale slot does not error, it
// returns zero products for every query, so retry with a live slot on empty.
const total = (b: Json) => Number((b.meta as Json | undefined)?.totalProducts ?? 0);
let batch = await call('silpo_find_products_batch', { ...ctx, products: QUERIES, limit: 5 });
console.log(`\nsearch with cart slot ${ctx.timeslotStart}:`, batch.error ?? batch.summary);
if (batch.error || total(batch) === 0) {
  const live = slotList.find((s) => s.available);
  if (live) {
    ctx.timeslotStart = String(live.start);
    ctx.timeslotEnd = String(live.end);
    batch = await call('silpo_find_products_batch', { ...ctx, products: QUERIES, limit: 5 });
    console.log(`search with live slot ${ctx.timeslotStart}:`, batch.error ?? batch.summary);
  }
}
if (batch.error || total(batch) === 0) {
  const sanity = await call('silpo_get_products', { ...ctx, mustHavePromotion: true, limit: 3 });
  console.log('get_products(promo) sanity:', sanity.error ?? sanity.summary ?? Object.keys(sanity).join(', '));
  const list = (sanity.products as Json[] | undefined) ?? [];
  for (const p of list.slice(0, 3)) console.log(`   ${p.name} | ₴${p.price} | stock ${p.stock}`);
}
if (batch.error) {
  writeFileSync(PROBE_FILE, JSON.stringify(raw, null, 2));
  process.exit(1);
}
for (const q of (batch.queries as Json[] | undefined) ?? []) {
  const products = (q.products as Json[] | undefined) ?? [];
  console.log(`\n"${q.query}" totalFound=${q.totalFound}`);
  for (const p of products.slice(0, 3)) {
    console.log(
      `   ${p.name} | ₴${p.price}${p.oldPrice ? ` (was ${p.oldPrice})` : ''} | ${p.displayRatio ?? '?'} | step ${p.step}${p.weighted ? ' weighted' : ''} | stock ${p.stock} | ext ${p.externalProductId}`
    );
  }
}

const first = ((batch.queries as Json[])?.find((q) => q.query === 'куряче філе')?.products as Json[])?.[0];
if (first?.slug) {
  const details = await call('silpo_get_product_details', { ...ctx, slug: first.slug });
  const product = details.product as Json;
  console.log('\nproduct card keys:', Object.keys(product).join(', '));
  console.log('url:', product.url, '| images:', (product.images as unknown[])?.length);
  const attrs = product.attributes;
  console.log(
    'attributes:',
    Array.isArray(attrs)
      ? `${attrs.length} entries, first: ${JSON.stringify(attrs.slice(0, 4))}`
      : JSON.stringify(attrs)?.slice(0, 600)
  );
}

const promos = await call('silpo_get_promotions', ctx);
const promoList = (promos.promotions as Json[] | undefined) ?? [];
console.log(`\npromotions: ${promoList.length}`);
for (const p of promoList.slice(0, 6)) console.log(`   ${p.code} | ${p.title} | ${p.productCount} products`);

writeFileSync(PROBE_FILE, JSON.stringify(raw, null, 2));
console.log('\nraw → .silpo-probe.local.json');
await client.close();
