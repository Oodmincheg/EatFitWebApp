// Selectable Zakaz.ua stores for the cart. Plain data — safe on client & server.
// Store ids come from https://stores-api.zakaz.ua/stores/ (see RESEARCH_ZakazUA_API.md).

export interface StoreOption {
  id: string;
  chain: string;
  label: string;
  city: string;
  blurb: string;
  logo: string;
}

export const STORE_OPTIONS: StoreOption[] = [
  {
    id: '482010105',
    chain: 'novus',
    label: 'NOVUS',
    city: 'Kyiv',
    blurb: 'Wide range, fast delivery',
    logo: '/images/stores/novus.webp',
  },
  {
    id: '48246401',
    chain: 'auchan',
    label: 'Auchan',
    city: 'Kyiv',
    blurb: 'Hypermarket prices',
    logo: '/images/stores/auchan.webp',
  },
  {
    id: '48215611',
    chain: 'metro',
    label: 'METRO',
    city: 'Kyiv',
    blurb: 'Bulk & value packs',
    logo: '/images/stores/metro.png',
  },
];

export const DEFAULT_STORE = STORE_OPTIONS[0];

// Hand-off between the Ingredients page (build) and the Cart page (matched list).
export const PENDING_CART_KEY = 'eatfit:pending-cart';
