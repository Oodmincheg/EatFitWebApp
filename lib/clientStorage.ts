// Keys for everything the app keeps in web storage. Kept together so
// logout can wipe per-user state without hunting through components.
export const FRIDGE_DRAFT_KEY = 'fridge-modal-draft';
export const CART_TICKS_PREFIX = 'eatfit:cart-ticks:';
export const SHOPPING_EDITS_PREFIX = 'eatfit:shopping-edits:';
export const THEME_KEY = 'eatfit_theme';

// Called on logout so drafts, ticks and list edits don't leak into the next
// account on this browser. The theme is a device preference and stays.
export function clearUserStorage() {
  try {
    sessionStorage.removeItem(FRIDGE_DRAFT_KEY);
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CART_TICKS_PREFIX) || key.startsWith(SHOPPING_EDITS_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable (private mode, etc.) — nothing to clean.
  }
}
