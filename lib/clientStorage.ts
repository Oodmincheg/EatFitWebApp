// Keys for everything the app keeps in web storage. Kept together so
// logout can wipe per-user state without hunting through components.
export const FRIDGE_DRAFT_KEY = 'fridge-modal-draft';
export const CART_TICKS_PREFIX = 'eatfit:cart-ticks:';

// Called on logout so drafts and ticks don't leak into the next account
// on this browser.
export function clearUserStorage() {
  try {
    sessionStorage.removeItem(FRIDGE_DRAFT_KEY);
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CART_TICKS_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage unavailable (private mode, etc.) — nothing to clean.
  }
}
