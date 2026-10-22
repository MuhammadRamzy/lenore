// Owner-supplied business identity (shop signboard, 2026-10-19). Single source
// for the storefront, structured data, quotations and contact links.
export const business = {
  legalName: "Lenore Trading LLP",
  brand: "Lenore",
  tagline: "Refined Bathroom Living",
  summary:
    "Bath fittings and sanitary ware showroom in Kuttiady, Kozhikode, Kerala: taps, showers, health faucets, sinks and bathroom accessories at MRP, with GST invoices and quotations on WhatsApp.",
  /** Owner-supplied warranty terms (2026-10-22), longest first. */
  warranty: [
    { years: 10, part: "CP fittings body", highlight: true },
    { years: 2, part: "Spindle & head", highlight: false },
    { years: 1, part: "Accessories", highlight: false },
  ],
  /** Towns the showroom serves; named in structured data and on the site. */
  serves: [
    "Kuttiady",
    "Vadakara",
    "Nadapuram",
    "Perambra",
    "Kakkattil",
    "Thottilpalam",
    "Kayakkodi",
    "Velom",
    "Kozhikode",
  ],
  phone: "+917511163131",
  phoneDisplay: "+91 75111 63131",
  email: "lenorebathfittings@gmail.com",
  origin: "https://www.lenoretrading.com",
  gstin: "32AANFL0054E1ZR",
  address: {
    street: "Vatayam, Near Mother Clinic",
    locality: "Kuttiady",
    district: "Kozhikode",
    region: "Kerala",
    regionCode: "KL",
    country: "IN",
  },
} as const;

export const addressLine = [
  business.address.street,
  business.address.locality,
  business.address.district,
  business.address.region,
].join(", ");
