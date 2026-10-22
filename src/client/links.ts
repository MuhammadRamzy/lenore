import { business } from "../business";
import type { CatalogueProduct } from "../shared";

/** WhatsApp deep link. Without a number WhatsApp lets the user pick any contact. */
export function whatsappLink(text: string, number = "") {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
/** Indian 10-digit numbers get the +91 prefix WhatsApp needs. */
export const withCountry = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};
export const businessWhatsapp = (configured: string) =>
  configured || business.phone.replace(/\D/g, "");
export const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${business.legalName}, ${business.address.street}, ${business.address.locality}, ${business.address.region}`,
)}`;

const demoImages: Record<string, string> = {
  "DEMO-BM01": "basin-mixer",
  "DEMO-SH02": "overhead-shower",
  "DEMO-TP03": "bib-tap",
  "DEMO-AC04": "towel-rail",
};
export type DisplayImage = {
  src: string;
  srcSet?: string;
  illustrative: boolean;
};
/** Small version of an uploaded image for grids and lists (falls back to the original). */
export const thumb = (url: string) =>
  url.startsWith("/api/media/") ? `${url}?w=600` : url;
// Grids pick the 600 px file; large views still get the full photo.
const uploaded = (url: string): DisplayImage => ({
  src: url,
  srcSet: `${thumb(url)} 600w, ${url} 1600w`,
  illustrative: false,
});
/** Uploaded media wins; labelled AI samples appear only for demo SKUs in demo mode. */
export function productImage(
  p: Pick<CatalogueProduct, "code" | "imageUrl" | "posterUrl">,
  demo: boolean,
): DisplayImage | null {
  if (p.imageUrl) return uploaded(p.imageUrl);
  const sample = demo ? demoImages[p.code] : undefined;
  if (sample)
    return {
      src: `/images/demo-${sample}-800.webp`,
      srcSet: `/images/demo-${sample}-480.webp 480w, /images/demo-${sample}-800.webp 800w`,
      illustrative: true,
    };
  if (p.posterUrl) return uploaded(p.posterUrl);
  return null;
}
