import "regenerator-runtime/runtime";
import { money, type QuoteItem } from "../shared";

export type CustomerDraft = { name: string; phone: string; notes: string };
export type Quotation = {
  reference: string;
  customer: CustomerDraft;
  items: QuoteItem[];
};
export function quotationTotal(items: QuoteItem[]): number | null {
  if (items.some((i) => i.pricePaise === null)) return null;
  const total = items.reduce(
    (n, i) => n + BigInt(i.pricePaise!) * BigInt(i.quantity),
    0n,
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(
      "This quotation is too large. Split it into smaller quotations.",
    );
  return Number(total);
}
export function quotationText(q: Quotation) {
  return [
    `LENORE · Quotation enquiry ${q.reference}`,
    `Customer: ${q.customer.name.trim() || "Not specified"}`,
    ...(q.customer.phone.trim() ? [`Phone: ${q.customer.phone.trim()}`] : []),
    ...(q.customer.notes.trim() ? [`Notes: ${q.customer.notes.trim()}`] : []),
    "",
    ...q.items.map(
      (i) =>
        `${i.code} · ${i.name}\nQuantity: ${i.quantity} · Suggested MRP: ${money(i.pricePaise)} · Amount: ${i.pricePaise === null ? "To be confirmed" : money(i.pricePaise * i.quantity)}`,
    ),
    "",
    `Products: ${q.items.length} · Total quantity: ${q.items.reduce((n, i) => n + i.quantity, 0)}`,
    `MRP total: ${money(quotationTotal(q.items))}`,
    "Suggested MRP only. Prices and availability require confirmation. This enquiry does not reserve stock.",
  ].join("\n");
}

/** A real browser-generated PDF; customer details stay on-device until an enquiry is submitted. */
export async function downloadQuotation(q: Quotation) {
  if (!q.items.length) throw new Error("Add a product before downloading.");
  const total = quotationTotal(q.items);
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const [sansBytes, malBytes, logoBytes] = await Promise.all(
    [
      "/fonts/quotation-sans.ttf",
      "/fonts/quotation-malayalam.ttf",
      "/images/lenore-mark.png",
    ].map(async (path) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error("Quotation assets could not load. Please try again.");
      return response.arrayBuffer();
    }),
  );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule.default);
  pdf.setTitle(`Lenore quotation ${q.reference}`);
  pdf.setAuthor("Lenore");
  const sans = await pdf.embedFont(sansBytes, { subset: true });
  const mal = await pdf.embedFont(malBytes, { subset: true });
  const mark = await pdf.embedPng(logoBytes);
  const ink = rgb(0.157, 0.149, 0.125),
    muted = rgb(0.416, 0.396, 0.361),
    bronze = rgb(0.471, 0.357, 0.231);
  const fonts = [sans, mal];
  const supported = fonts.map((f) => new Set(f.getCharacterSet()));
  const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
  function runs(text: string) {
    const result: { text: string; font: typeof sans }[] = [];
    for (const { segment } of segments.segment(text)) {
      const index = supported.findIndex((chars) =>
        [...segment].every((c) => chars.has(c.codePointAt(0)!)),
      );
      if (index < 0)
        throw new Error(
          "A character in this quotation cannot be rendered. Use English or Malayalam text.",
        );
      const font = fonts[index],
        last = result.at(-1);
      if (last?.font === font) last.text += segment;
      else result.push({ text: segment, font });
    }
    return result;
  }
  const width = (text: string, size: number) =>
    runs(text).reduce((n, r) => n + r.font.widthOfTextAtSize(r.text, size), 0);
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  let page = pdf.addPage([595.28, 841.89]);
  pages.push(page);
  let y = 0;
  function draw(
    text: string,
    x: number,
    baseline: number,
    size = 10,
    color = ink,
  ) {
    for (const run of runs(text)) {
      page.drawText(run.text, { x, y: baseline, size, font: run.font, color });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  }
  function header() {
    page.drawImage(mark, { x: 44, y: 772, width: 18, height: 27 });
    draw("LENORE", 76, 783, 20);
    draw("BATH FITTINGS & SANITARY WARE", 76, 770, 6.5, muted);
    draw(`QUOTATION ENQUIRY · ${q.reference}`, 44, 748, 10, bronze);
    page.drawLine({
      start: { x: 44, y: 730 },
      end: { x: 551, y: 730 },
      thickness: 1,
      color: rgb(0.82, 0.78, 0.72),
    });
    y = 705;
  }
  function ensure(space: number) {
    if (y - space < 75) {
      page = pdf.addPage([595.28, 841.89]);
      pages.push(page);
      header();
    }
  }
  function paragraph(value: string, size = 10) {
    for (const source of value
      .replace(/\p{Cc}/gu, (character) => (character === "\n" ? "\n" : " "))
      .split("\n")) {
      let line = "";
      for (const { segment } of segments.segment(source)) {
        if (line && width(line + segment, size) > 500) {
          ensure(size + 7);
          draw(line, 44, y, size);
          y -= size + 7;
          line = segment;
        } else line += segment;
      }
      ensure(size + 7);
      draw(line, 44, y, size);
      y -= size + 7;
    }
    y -= 5;
  }
  header();
  paragraph(
    `Date: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`,
  );
  paragraph(`Customer: ${q.customer.name.trim() || "Not specified"}`);
  if (q.customer.phone) paragraph(`Phone: ${q.customer.phone}`);
  if (q.customer.notes) paragraph(`Notes: ${q.customer.notes}`);
  y -= 12;
  for (const [index, item] of q.items.entries()) {
    ensure(85);
    paragraph(`${index + 1}. ${item.code} — ${item.name}`, 11);
    paragraph(
      `Quantity: ${item.quantity}    Suggested MRP: ${money(item.pricePaise)}`,
    );
    paragraph(
      `Amount: ${item.pricePaise === null ? "To be confirmed" : money(item.pricePaise * item.quantity)}`,
    );
    page.drawLine({
      start: { x: 44, y },
      end: { x: 551, y },
      thickness: 0.5,
      color: rgb(0.86, 0.84, 0.8),
    });
    y -= 20;
  }
  ensure(100);
  paragraph(
    `Products: ${q.items.length} · Total quantity: ${q.items.reduce((n, i) => n + i.quantity, 0)}`,
  );
  paragraph(`MRP total: ${money(total)}`, 14);
  paragraph(
    "Suggested MRP only. Prices and availability require confirmation. This enquiry does not reserve stock.",
    9,
  );
  pages.forEach((p, i) =>
    p.drawText(
      `Lenore · Enquiry, not an invoice · ${i + 1} / ${pages.length}`,
      { x: 44, y: 35, size: 8, font: sans, color: muted },
    ),
  );
  const bytes = await pdf.save();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `Lenore-${q.reference}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
