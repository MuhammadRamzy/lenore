import { createContext, useSyncExternalStore } from "react";
import type { CatalogueProduct } from "../../shared";

/** A product in the visitor's cart, with what the cart needs to show it offline. */
export type CartItem = Pick<
  CatalogueProduct,
  "id" | "slug" | "code" | "name" | "pricePaise" | "imageUrl" | "posterUrl"
> & { qty: number };

const KEY = "lenore-cart-v1";
const EMPTY: CartItem[] = [];
let items: CartItem[] | null = null;
const listeners = new Set<() => void>();

function load(): CartItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved : EMPTY;
  } catch {
    return EMPTY;
  }
}
function save(next: CartItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: the cart still works for this visit.
  }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the cart.
  const sync = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    items = load();
    listener();
  };
  window.addEventListener("storage", sync);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", sync);
  };
}

/** The cart; empty during server rendering and hydration, then the saved one. */
export const useCart = () =>
  useSyncExternalStore(
    subscribe,
    () => (items ??= load()),
    () => EMPTY,
  );

export function setQty(product: Omit<CartItem, "qty">, qty: number) {
  const current = items ?? load();
  const rest = current.filter((i) => i.id !== product.id);
  if (qty <= 0) return save(rest);
  const { id, slug, code, name, pricePaise, imageUrl, posterUrl } = product;
  const item = { id, slug, code, name, pricePaise, imageUrl, posterUrl, qty };
  const at = current.findIndex((i) => i.id === product.id);
  save(
    at < 0
      ? [...current, item]
      : current.map((i) => (i.id === product.id ? item : i)),
  );
}
export const clearCart = () => save(EMPTY);

/** Opens the cart panel from anywhere on the site. */
export const OpenCart = createContext<() => void>(() => undefined);
