// Owner-supplied business identity (shop signboard, 2026-10-19). Single source
// for the storefront, structured data, quotations and contact links.
export const business = {
  legalName: "Lenore Trading LLP",
  brand: "Lenore",
  tagline: "Refined Bathroom Living",
  summary:
    "Bath fittings and sanitary ware from Lenore Trading LLP, Kuttiady, Kerala. Browse the collection, order online or request a quotation.",
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
