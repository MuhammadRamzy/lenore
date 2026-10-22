import { useContext, useEffect, useRef, useState } from "react";
import {
  Check,
  MapPin,
  MessageCircle,
  Phone,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { money, type CatalogueProduct } from "../../shared";
import {
  businessWhatsapp,
  mapsLink,
  productImage,
  telLink,
  whatsappLink,
} from "../links";
import { business } from "../../business";
import { Stepper } from "../sales/ui";
import { clearCart, OpenCart, setQty, useCart, type CartItem } from "./cart";

/** "Add to cart", then a quantity stepper once the product is in the cart. */
export function AddToCart({
  product,
  large = false,
}: {
  product: CatalogueProduct;
  large?: boolean;
}) {
  const cart = useCart();
  const open = useContext(OpenCart);
  const qty = cart.find((i) => i.id === product.id)?.qty ?? 0;
  if (!qty)
    return (
      <button
        type="button"
        className={`btn ${large ? "btn-primary btn-lg" : "btn-ghost btn-sm"} add-to-cart`}
        onClick={() => {
          setQty(product, 1);
          window.dispatchEvent(
            new CustomEvent("lenore:cart-added", { detail: product.name }),
          );
        }}
      >
        <ShoppingBag size={large ? 18 : 16} aria-hidden="true" /> Add to cart
      </button>
    );
  return (
    <div className={`in-cart${large ? " large" : ""}`}>
      <Stepper
        compact={!large}
        value={qty}
        label={`Quantity of ${product.code} in cart`}
        onChange={(n) => setQty(product, n)}
      />
      <button type="button" className="text-link" onClick={open}>
        View cart
      </button>
    </div>
  );
}

export function CartButton() {
  const cart = useCart();
  const open = useContext(OpenCart);
  const count = cart.reduce((n, i) => n + i.qty, 0);
  return (
    <button
      type="button"
      className="icon-btn cart-btn"
      aria-label={
        count
          ? `Cart, ${count} ${count === 1 ? "item" : "items"}`
          : "Cart, empty"
      }
      onClick={open}
    >
      <ShoppingBag size={21} aria-hidden="true" />
      {count > 0 && <span className="cart-count">{count}</span>}
    </button>
  );
}

/** "Added to cart" confirmation with a shortcut to the cart. */
export function CartToast() {
  const open = useContext(OpenCart);
  const [added, setAdded] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => {
    const show = (e: Event) =>
      setAdded((a) => ({
        name: String((e as CustomEvent).detail),
        n: (a?.n ?? 0) + 1,
      }));
    window.addEventListener("lenore:cart-added", show);
    return () => window.removeEventListener("lenore:cart-added", show);
  }, []);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), 3500);
    return () => clearTimeout(t);
  }, [added]);
  return (
    <div className="cart-toast-region" role="status" aria-live="polite">
      {added && (
        <div className="cart-toast" key={added.n}>
          <Check size={18} aria-hidden="true" />
          <span>
            <b>Added to cart</b>
            <small>{added.name}</small>
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setAdded(null);
              open();
            }}
          >
            View cart
          </button>
        </div>
      )}
    </div>
  );
}

/** Phone bottom bar: once the cart has items, it takes the directions slot. */
export function ActionBar({ whatsappHref }: { whatsappHref: string }) {
  const cart = useCart();
  const open = useContext(OpenCart);
  const count = cart.reduce((n, i) => n + i.qty, 0);
  return (
    <nav className="action-bar" aria-label="Quick contact">
      <a href={telLink(business.phone)}>
        <Phone size={20} aria-hidden="true" />
        Call
      </a>
      <a className="primary" href={whatsappHref} target="_blank" rel="noopener">
        <MessageCircle size={20} aria-hidden="true" />
        WhatsApp
      </a>
      {count ? (
        <button type="button" className="cart" onClick={open}>
          <ShoppingBag size={20} aria-hidden="true" />
          Cart · {count}
        </button>
      ) : (
        <a href={mapsLink} target="_blank" rel="noopener">
          <MapPin size={20} aria-hidden="true" />
          Directions
        </a>
      )}
    </nav>
  );
}

/** Name and phone are remembered on this device for the next request. */
const CONTACT_KEY = "lenore-contact";
function savedContact(): { name: string; phone: string; place: string } {
  try {
    return {
      name: "",
      phone: "",
      place: "",
      ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "{}"),
    };
  } catch {
    return { name: "", phone: "", place: "" };
  }
}

const lineTotal = (i: CartItem) =>
  i.pricePaise === null ? null : i.pricePaise * i.qty;

/** The itemised WhatsApp message staff receive. */
export function cartMessage(
  items: CartItem[],
  kind: "quote" | "order",
  who: { name: string; phone: string; place: string; note: string },
) {
  const priced = items.every((i) => i.pricePaise !== null);
  const total = items.reduce((n, i) => n + (lineTotal(i) ?? 0), 0);
  return [
    kind === "order"
      ? "Hello Lenore, I would like to order:"
      : "Hello Lenore, please send a quotation for:",
    "",
    ...items.map(
      (i, n) =>
        `${n + 1}. ${i.name} (${i.code}) × ${i.qty}${i.pricePaise === null ? "" : ` · MRP ${money(i.pricePaise)} each`}`,
    ),
    ...(priced ? ["", `Total at MRP: ${money(total)}`] : []),
    "",
    `Name: ${who.name}`,
    `Phone: ${who.phone}`,
    who.place ? `Place: ${who.place}` : null,
    who.note ? `Note: ${who.note}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function CartPanel({
  open,
  onClose,
  whatsapp,
}: {
  open: boolean;
  onClose: () => void;
  whatsapp: string;
}) {
  const cart = useCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"quote" | "order">("quote");
  const [sent, setSent] = useState(false);
  // The native dialog gives focus trapping, Escape and the backdrop for free.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const priced = cart.every((i) => i.pricePaise !== null);
  const total = cart.reduce((n, i) => n + (lineTotal(i) ?? 0), 0);
  const count = cart.reduce((n, i) => n + i.qty, 0);
  // Read when the form first shows (client only; the server renders an empty cart).
  const [contact] = useState(savedContact);

  return (
    <dialog
      ref={dialog}
      className="cart-panel"
      aria-labelledby="cart-title"
      onClose={() => {
        setSent(false);
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop closes the panel.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className="cart-inner">
        <header className="cart-head">
          <h2 id="cart-title">
            Your cart{" "}
            {count > 0 && (
              <span className="muted">
                · {count} {count === 1 ? "item" : "items"}
              </span>
            )}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close cart"
            onClick={() => dialog.current?.close()}
          >
            <X size={22} />
          </button>
        </header>

        {sent ? (
          <div className="cart-done" role="status">
            <Check size={28} aria-hidden="true" />
            <h3>Request sent</h3>
            <p>
              Your {kind === "order" ? "order" : "quotation"} request opened in
              WhatsApp. Send the message there, and our team will confirm prices
              and availability.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                clearCart();
                dialog.current?.close();
              }}
            >
              Clear cart and close
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => setSent(false)}
            >
              Back to the cart
            </button>
          </div>
        ) : cart.length === 0 ? (
          <div className="cart-empty">
            <ShoppingBag size={28} aria-hidden="true" />
            <p>Your cart is empty.</p>
            <a className="btn btn-primary" href="/collections">
              Browse collections
            </a>
          </div>
        ) : (
          <>
            <ul className="cart-lines">
              {cart.map((i) => {
                const image = productImage(i, false);
                return (
                  <li key={i.id}>
                    <a
                      href={`/products/${i.slug}`}
                      className="cart-thumb"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {image && (
                        <img
                          src={image.src}
                          srcSet={image.srcSet}
                          sizes="64px"
                          alt=""
                          width={64}
                          height={64}
                        />
                      )}
                    </a>
                    <div className="cart-line-main">
                      <a href={`/products/${i.slug}`}>{i.name}</a>
                      <small>
                        {i.code}
                        {i.pricePaise !== null && ` · ${money(i.pricePaise)}`}
                      </small>
                      <Stepper
                        compact
                        value={i.qty}
                        label={`Quantity of ${i.code}`}
                        onChange={(n) => setQty(i, n)}
                      />
                    </div>
                    <div className="cart-line-end">
                      {lineTotal(i) !== null && (
                        <strong>{money(lineTotal(i))}</strong>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${i.code}`}
                        onClick={() => setQty(i, 0)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {priced && (
              <p className="cart-total">
                <span>Total at MRP</span>
                <strong>{money(total)}</strong>
              </p>
            )}
            <form
              className="cart-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const who = {
                  name: String(f.get("name") ?? "").trim(),
                  phone: String(f.get("phone") ?? "").trim(),
                  place: String(f.get("place") ?? "").trim(),
                  note: String(f.get("note") ?? "").trim(),
                };
                try {
                  localStorage.setItem(
                    CONTACT_KEY,
                    JSON.stringify({
                      name: who.name,
                      phone: who.phone,
                      place: who.place,
                    }),
                  );
                } catch {
                  // Not remembered in private mode.
                }
                // Saved for staff follow-up; keepalive lets it finish while WhatsApp opens.
                void fetch("/api/enquiries", {
                  method: "POST",
                  keepalive: true,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: crypto.randomUUID(),
                    name: who.name,
                    phone: who.phone,
                    interest: "",
                    message: [who.place && `Place: ${who.place}`, who.note]
                      .filter(Boolean)
                      .join("\n"),
                    kind,
                    items: cart.map((i) => ({
                      productId: i.id,
                      quantity: i.qty,
                    })),
                  }),
                }).catch(() => undefined);
                window.open(
                  whatsappLink(
                    cartMessage(cart, kind, who),
                    businessWhatsapp(whatsapp),
                  ),
                  "_blank",
                  "noopener",
                );
                setSent(true);
              }}
            >
              <fieldset className="cart-kind">
                <legend>Request</legend>
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "quote"}
                    onChange={() => setKind("quote")}
                  />
                  Quotation
                </label>
                <label>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === "order"}
                    onChange={() => setKind("order")}
                  />
                  Order
                </label>
              </fieldset>
              <div className="cart-fields">
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={contact.name}
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Phone
                  <input
                    name="phone"
                    defaultValue={contact.phone}
                    required
                    type="tel"
                    inputMode="tel"
                    pattern="[+\d\s()\-]{7,25}"
                    maxLength={25}
                    autoComplete="tel"
                  />
                </label>
                <label>
                  <span>
                    Place <span className="muted">(optional)</span>
                  </span>
                  <input
                    name="place"
                    defaultValue={contact.place}
                    maxLength={120}
                  />
                </label>
                <label>
                  <span>
                    Note <span className="muted">(optional)</span>
                  </span>
                  <input name="note" maxLength={500} />
                </label>
              </div>
              <button className="btn btn-primary btn-lg cart-send">
                <MessageCircle size={18} aria-hidden="true" />
                Send {kind === "order" ? "order" : "quotation"} request on
                WhatsApp
              </button>
              <p className="fine-print">
                Prices are MRP, inclusive of taxes. Our team will confirm
                availability on WhatsApp.
              </p>
            </form>
          </>
        )}
      </div>
    </dialog>
  );
}
