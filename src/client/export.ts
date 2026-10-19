import type { Product } from "../shared";
import { availability } from "../shared";

export function inventoryCsv(products: Product[]) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (typeof value === "string" && /^\s*[=+@-]/u.test(text))
      text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: (string | number)[][] = [
    [
      "Product code",
      "Product name",
      "Category",
      "Suggested MRP (INR)",
      "Stock",
      "Unit",
      "Availability",
      "Catalogue",
      "Last updated",
    ],
    ...products.map((p) => [
      p.code,
      p.name,
      p.category,
      p.pricePaise === null ? "" : (p.pricePaise / 100).toFixed(2),
      p.stock,
      p.unit,
      availability(p.stock, p.lowStock),
      p.published ? "Published" : "Draft",
      p.updatedAt,
    ]),
  ];
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
export function downloadInventoryCsv(products: Product[]) {
  const url = URL.createObjectURL(
    new Blob([inventoryCsv(products)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `Lenore-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
