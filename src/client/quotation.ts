import "regenerator-runtime/runtime";
import { money, percent, type Quotation } from "../shared";
import { business, addressLine } from "../business";

const date = (iso: string) =>
  new Date(
    iso.length === 10 ? `${iso}T00:00:00+05:30` : iso,
  ).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

/** Plain-text quotation for WhatsApp and copying. */
export function quotationText(q: Quotation, link = "") {
  const lines = q.items.map((l, i) => {
    const price =
      l.discountBp > 0
        ? `${money(l.unitPricePaise)} (MRP ${money(l.mrpPaise)}, ${percent(l.discountBp)} off)`
        : money(l.unitPricePaise ?? l.mrpPaise);
    return `${i + 1}. ${l.name} (${l.code})\n   ${l.quantity} ${l.unit} × ${price} = ${l.amountPaise === null ? "To be confirmed" : money(l.amountPaise)}`;
  });
  return [
    `*LENORE · Quotation ${q.number}*`,
    `For: ${q.customerName}${q.customerPlace ? `, ${q.customerPlace}` : ""}`,
    `Date: ${date(q.createdAt)} · Valid until ${date(q.validUntil)}`,
    "",
    ...lines,
    "",
    ...(q.discountPaise
      ? [
          `MRP total: ${money(q.mrpTotalPaise)}`,
          `Discount: − ${money(q.discountPaise)}`,
        ]
      : []),
    `*Total: ${q.totalPaise === null ? "To be confirmed" : money(q.totalPaise)}*`,
    ...(q.notes ? ["", `Notes: ${q.notes}`] : []),
    ...(link ? ["", `View or download: ${link}`] : []),
    "",
    `${q.createdByName}${q.createdByPhone ? ` · +${q.createdByPhone}` : ""}`,
    `${business.legalName} · ${business.phoneDisplay}`,
  ].join("\n");
}

/** Browser-generated A4 PDF with English and Malayalam font coverage. */
export async function quotationPdf(q: Quotation): Promise<File> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const [sansBytes, malBytes, markBytes] = await Promise.all(
    [
      "/fonts/quotation-sans.ttf",
      "/fonts/quotation-malayalam.ttf",
      "/icons/mark-bronze-64.png",
    ].map(async (path) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error("Quotation assets could not load. Please try again.");
      return response.arrayBuffer();
    }),
  );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule.default);
  pdf.setTitle(`Lenore quotation ${q.number}`);
  pdf.setAuthor(business.legalName);
  const sans = await pdf.embedFont(sansBytes, { subset: true });
  const mal = await pdf.embedFont(malBytes, { subset: true });
  const mark = await pdf.embedPng(markBytes);
  const ink = rgb(0.08, 0.08, 0.08),
    muted = rgb(0.42, 0.42, 0.42),
    accent = rgb(0.54, 0.35, 0.17),
    rule = rgb(0.88, 0.87, 0.85);
  const fonts = [sans, mal];
  const supported = fonts.map((f) => new Set(f.getCharacterSet()));
  const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
  type Font = typeof sans;
  function runs(text: string) {
    const result: { text: string; font: Font }[] = [];
    for (const { segment } of segments.segment(text.replace(/\p{Cc}/gu, " "))) {
      const index = supported.findIndex((chars) =>
        [...segment].every((c) => chars.has(c.codePointAt(0)!)),
      );
      if (index < 0)
        throw new Error(
          "A character in this quotation cannot be printed. Use English or Malayalam text.",
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
  const W = 595.28,
    H = 841.89,
    L = 44,
    R = W - 44;
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  let page = pdf.addPage([W, H]);
  pages.push(page);
  let y = 0;
  function draw(
    text: string,
    x: number,
    baseline: number,
    size = 9.5,
    color = ink,
  ) {
    for (const run of runs(text)) {
      page.drawText(run.text, { x, y: baseline, size, font: run.font, color });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  }
  const drawRight = (
    text: string,
    x: number,
    baseline: number,
    size = 9.5,
    color = ink,
  ) => draw(text, x - width(text, size), baseline, size, color);
  function wrap(text: string, max: number, size: number) {
    const out: string[] = [];
    for (const source of text.split("\n")) {
      let line = "";
      for (const word of source.split(/(\s+)/)) {
        if (line && width(line + word, size) > max) {
          out.push(line.trimEnd());
          line = word.trimStart();
        } else line += word;
      }
      out.push(line);
    }
    return out;
  }
  const line = (at: number, thickness = 0.6) =>
    page.drawLine({
      start: { x: L, y: at },
      end: { x: R, y: at },
      thickness,
      color: rule,
    });
  function header() {
    page.drawImage(mark, { x: L, y: H - 86, width: 26, height: 33 });
    draw("LENORE", L + 36, H - 66, 18);
    draw(business.tagline.toUpperCase(), L + 37, H - 80, 6.5, accent);
    drawRight("QUOTATION", R, H - 62, 13, accent);
    drawRight(q.number, R, H - 78, 9.5);
    line(H - 100, 1);
    y = H - 122;
  }
  const cols = { qty: 330, mrp: 400, disc: 455, amount: R };
  function tableHead() {
    draw("PRODUCT", L, y, 7.5, muted);
    drawRight("QTY", cols.qty, y, 7.5, muted);
    drawRight("MRP", cols.mrp, y, 7.5, muted);
    drawRight("DISC.", cols.disc, y, 7.5, muted);
    drawRight("AMOUNT", cols.amount, y, 7.5, muted);
    y -= 8;
    line(y);
    y -= 16;
  }
  function ensure(space: number, withTable = false) {
    if (y - space < 70) {
      page = pdf.addPage([W, H]);
      pages.push(page);
      header();
      if (withTable) tableHead();
    }
  }
  header();
  // Parties and dates
  const meta: [string, string][] = [
    ["Date", date(q.createdAt)],
    ["Valid until", date(q.validUntil)],
    ...(q.version > 1
      ? ([["Revision", String(q.version)]] as [string, string][])
      : []),
  ];
  draw("PREPARED FOR", L, y, 7, muted);
  draw("PREPARED BY", 240, y, 7, muted);
  y -= 14;
  const forLines = [q.customerName, q.customerPlace, q.customerPhone].filter(
    Boolean,
  );
  const byLines = [
    q.createdByName,
    q.createdByPhone ? `+${q.createdByPhone}` : business.phoneDisplay,
  ];
  for (
    let i = 0;
    i < Math.max(forLines.length, byLines.length, meta.length);
    i++
  ) {
    if (forLines[i])
      draw(forLines[i], L, y, i === 0 ? 10.5 : 9, i === 0 ? ink : muted);
    if (byLines[i])
      draw(byLines[i], 240, y, i === 0 ? 10.5 : 9, i === 0 ? ink : muted);
    if (meta[i]) {
      draw(meta[i][0], 420, y, 8.5, muted);
      drawRight(meta[i][1], R, y, 9);
    }
    y -= 14;
  }
  y -= 14;
  tableHead();
  q.items.forEach((l, i) => {
    const nameLines = wrap(`${i + 1}. ${l.name}`, 270, 9.5);
    ensure(nameLines.length * 13 + 22, true);
    nameLines.forEach((t, j) => draw(t, L, y - j * 13, 9.5));
    drawRight(`${l.quantity} ${l.unit}`, cols.qty, y);
    drawRight(money(l.mrpPaise), cols.mrp, y);
    drawRight(
      l.discountBp ? percent(l.discountBp) : "—",
      cols.disc,
      y,
      9.5,
      l.discountBp ? accent : muted,
    );
    drawRight(
      l.amountPaise === null ? "To confirm" : money(l.amountPaise),
      cols.amount,
      y,
    );
    y -= nameLines.length * 13;
    draw(l.code, L + 12, y, 8, muted);
    y -= 10;
    line(y, 0.4);
    y -= 16;
  });
  ensure(90);
  const totals: [string, string, boolean][] = [];
  if (q.discountPaise)
    totals.push(
      ["MRP total", money(q.mrpTotalPaise), false],
      ["Discount", `− ${money(q.discountPaise)}`, false],
    );
  totals.push([
    "Total",
    q.totalPaise === null ? "To be confirmed" : money(q.totalPaise),
    true,
  ]);
  for (const [label, value, grand] of totals) {
    draw(label, 360, y, grand ? 11 : 9.5, grand ? ink : muted);
    drawRight(value, R, y, grand ? 13 : 9.5);
    y -= grand ? 22 : 15;
  }
  draw(
    `${q.items.length} products · ${q.items.reduce((n, l) => n + l.quantity, 0)} units`,
    L,
    y + 8,
    8,
    muted,
  );
  y -= 10;
  for (const [title, body] of [
    ["NOTES", q.notes],
    ["TERMS", q.terms],
  ] as const) {
    if (!body) continue;
    const text = wrap(body, R - L, 8.5);
    ensure(text.length * 12 + 24);
    draw(title, L, y, 7, muted);
    y -= 13;
    for (const t of text) {
      draw(t, L, y, 8.5, muted);
      y -= 12;
    }
    y -= 8;
  }
  const foot = `${business.legalName} · ${addressLine} · GSTIN ${business.gstin} · ${business.phoneDisplay} · ${business.email}`;
  pages.forEach((p, i) => {
    page = p;
    const footLines = wrap(foot, R - L - 50, 7);
    footLines.forEach((t, j) => draw(t, L, 44 - j * 10, 7, muted));
    drawRight(`${i + 1} / ${pages.length}`, R, 44, 7, muted);
  });
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], `Lenore-${q.number}.pdf`, {
    type: "application/pdf",
  });
}
