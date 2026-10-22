import { business, addressLine } from "../../business";
import { methodLabel } from "../../erp";
import {
  actions,
  ageing,
  change,
  glossary,
  hourLabel,
  margin,
  pct,
  summary,
  weekdayName,
  type BusinessReport,
  type ReportMetrics,
} from "../../report";

/*
 * Business report as an A4 PDF, built in the browser with pdf-lib.
 * Designed to be printed and filed: black-and-white safe, a reference and
 * page number on every page, a wider inside margin for binding, and a
 * sign-off block. Every section opens with a plain-language "how to read".
 */

type Period = { kind: "month" | "quarter" | "year" | "custom"; label: string };

const inr = (p: number) =>
  `${p < 0 ? "-" : ""}₹${Math.round(Math.abs(p) / 100).toLocaleString("en-IN")}`;
const inr2 = (p: number) =>
  `${p < 0 ? "-" : ""}₹${(Math.abs(p) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const num = (v: number) => Math.round(v).toLocaleString("en-IN");
const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
/** Characters the embedded font lacks, replaced with ones it has. */
const clean = (t: string) =>
  t
    .replace(/−/g, "-")
    .replace(/→/g, "to")
    .replace(/[↑↓✓≈]/g, "")
    .replace(/\p{Cc}/gu, " ");

export async function businessReportPdf(
  r: BusinessReport,
  period: Period,
  reference: string,
): Promise<Blob> {
  const [{ PDFDocument, rgb }, fontkitModule] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const [regularBytes, boldBytes, markBytes] = await Promise.all(
    [
      "/fonts/quotation-sans.ttf",
      "/fonts/report-sans-bold.ttf",
      "/images/lenore-mark-bronze.png",
    ].map(async (path) => {
      const res = await fetch(path);
      if (!res.ok)
        throw new Error("Report assets could not load. Please try again.");
      return res.arrayBuffer();
    }),
  );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkitModule.default);
  pdf.setTitle(`${business.brand} business report ${period.label}`);
  pdf.setAuthor(business.legalName);
  pdf.setSubject(`Reference ${reference}`);
  pdf.setCreator("Lenore workspace");
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const mark = await pdf.embedPng(markBytes);
  type Font = typeof regular;
  type Page = ReturnType<typeof pdf.addPage>;

  const ink = rgb(0.09, 0.09, 0.09);
  const muted = rgb(0.4, 0.4, 0.4);
  const faint = rgb(0.62, 0.62, 0.62);
  const accent = rgb(0.54, 0.35, 0.17);
  const accentSoft = rgb(0.96, 0.93, 0.89);
  const fill = rgb(0.955, 0.95, 0.94);
  const rule = rgb(0.84, 0.83, 0.81);
  const good = rgb(0.12, 0.42, 0.25);
  const bad = rgb(0.62, 0.2, 0.15);
  const white = rgb(1, 1, 1);

  // A4, wider inside margin (left) for binding or a punched file.
  const W = 595.28,
    H = 841.89,
    L = 58,
    R = W - 42,
    TOP = H - 64,
    BOTTOM = 64,
    CW = R - L;

  const pages: Page[] = [];
  let page!: Page;
  let y = 0;
  const contents: { title: string; page: number }[] = [];

  const width = (t: string, size: number, font: Font = regular) =>
    font.widthOfTextAtSize(clean(t), size);
  function text(
    t: string,
    x: number,
    at: number,
    o: { size?: number; font?: Font; color?: typeof ink } = {},
  ) {
    page.drawText(clean(t), {
      x,
      y: at,
      size: o.size ?? 9,
      font: o.font ?? regular,
      color: o.color ?? ink,
    });
  }
  const textRight = (
    t: string,
    x: number,
    at: number,
    o: { size?: number; font?: Font; color?: typeof ink } = {},
  ) => text(t, x - width(t, o.size ?? 9, o.font), at, o);
  function wrap(t: string, max: number, size: number, font: Font = regular) {
    const out: string[] = [];
    for (const para of clean(t).split("\n")) {
      let line = "";
      for (const word of para.split(/(\s+)/)) {
        if (line && width(line + word, size, font) > max) {
          out.push(line.trimEnd());
          line = word.trimStart();
        } else line += word;
      }
      out.push(line);
    }
    return out;
  }
  function newPage() {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = TOP;
  }
  /** Start a new page when fewer than `h` points remain. */
  function ensure(h: number) {
    if (y - h < BOTTOM) newPage();
  }
  function paragraph(
    t: string,
    o: { size?: number; color?: typeof ink; font?: Font; indent?: number } = {},
  ) {
    const size = o.size ?? 9.5;
    const x = L + (o.indent ?? 0);
    for (const line of wrap(t, CW - (o.indent ?? 0), size, o.font)) {
      ensure(size + 5);
      text(line, x, y - size, { size, color: o.color, font: o.font });
      y -= size + 4.5;
    }
  }

  /* ───── Building blocks ───── */
  function section(no: number, title: string, intro: string) {
    newPage();
    contents.push({ title: `${no}. ${title}`, page: pages.length });
    text(String(no).padStart(2, "0"), L, y - 12, {
      size: 11,
      font: bold,
      color: accent,
    });
    text(title, L + 26, y - 14, { size: 17, font: bold });
    y -= 26;
    page.drawLine({
      start: { x: L, y },
      end: { x: R, y },
      thickness: 1.2,
      color: ink,
    });
    y -= 12;
    // "How to read": every reader, accountant or not, knows what follows.
    const lines = wrap(intro, CW - 28, 9);
    const h = lines.length * 13 + 22;
    page.drawRectangle({ x: L, y: y - h, width: CW, height: h, color: fill });
    page.drawRectangle({ x: L, y: y - h, width: 3, height: h, color: accent });
    text("HOW TO READ THIS", L + 14, y - 15, {
      size: 7,
      font: bold,
      color: accent,
    });
    lines.forEach((ln, i) =>
      text(ln, L + 14, y - 29 - i * 13, { size: 9, color: muted }),
    );
    y -= h + 18;
  }
  /** Section sub-heading; `need` keeps it on the same page as what follows. */
  function heading(t: string, note?: string, need = 60) {
    ensure(26 + need);
    y -= 6;
    text(t, L, y - 11, { size: 11.5, font: bold });
    if (note) textRight(note, R, y - 10, { size: 7.5, color: muted });
    y -= 20;
  }
  type Trend = { now: number; before: number; good?: "up" | "down" };
  /** Small coloured triangle drawn as a shape (the font has no arrows). */
  function triangle(x: number, at: number, up: boolean, color: typeof ink) {
    page.drawSvgPath(up ? "M0 0 L4 -6 L8 0 Z" : "M0 -6 L4 0 L8 -6 Z", {
      x,
      y: at + 7,
      color,
      scale: 1,
    });
  }
  function trendLabel(t: Trend, x: number, at: number, size = 7.5) {
    const ch = change(t.now, t.before);
    if (ch === null) {
      text("no earlier data", x, at, { size, color: faint });
      return;
    }
    if (Math.abs(ch) < 0.005) {
      text("same as before", x, at, { size, color: muted });
      return;
    }
    const up = ch > 0;
    const positive = (t.good ?? "up") === "up" ? up : !up;
    const color = positive ? good : bad;
    triangle(x, at, up, color);
    text(`${pct(Math.abs(ch))} vs previous`, x + 11, at, { size, color });
  }
  /** KPI tiles, three per row. */
  function tiles(
    items: { label: string; value: string; note?: string; trend?: Trend }[],
  ) {
    const cols = 3,
      gap = 10,
      w = (CW - gap * (cols - 1)) / cols,
      h = 66;
    for (let i = 0; i < items.length; i += cols) {
      ensure(h + gap);
      items.slice(i, i + cols).forEach((it, j) => {
        const x = L + j * (w + gap);
        page.drawRectangle({
          x,
          y: y - h,
          width: w,
          height: h,
          borderColor: rule,
          borderWidth: 0.8,
        });
        text(it.label.toUpperCase(), x + 10, y - 15, {
          size: 6.8,
          font: bold,
          color: muted,
        });
        text(it.value, x + 10, y - 37, { size: 16, font: bold });
        if (it.trend) trendLabel(it.trend, x + 10, y - 55);
        else if (it.note)
          text(it.note, x + 10, y - 55, { size: 7.5, color: muted });
      });
      y -= h + gap;
    }
    y -= 4;
  }
  type Col = {
    head: string;
    w: number;
    align?: "left" | "right";
    bold?: boolean;
  };
  /** Table with a repeating header, zebra rows and an optional total row. */
  function table(
    cols: Col[],
    rows: (string | number)[][],
    o: { total?: (string | number)[]; empty?: string; size?: number } = {},
  ) {
    const size = o.size ?? 8.4;
    const scale = CW / cols.reduce((n, c) => n + c.w, 0);
    const ws = cols.map((c) => c.w * scale);
    const rowH = size + 9;
    const headRow = () => {
      ensure(rowH * 2);
      page.drawRectangle({
        x: L,
        y: y - rowH,
        width: CW,
        height: rowH,
        color: ink,
      });
      let x = L;
      cols.forEach((c, i) => {
        if (c.align === "right")
          textRight(c.head, x + ws[i] - 6, y - rowH + 6, {
            size: size - 0.6,
            font: bold,
            color: white,
          });
        else
          text(c.head, x + 6, y - rowH + 6, {
            size: size - 0.6,
            font: bold,
            color: white,
          });
        x += ws[i];
      });
      y -= rowH;
    };
    headRow();
    if (!rows.length) {
      text(o.empty ?? "Nothing recorded in this period.", L + 6, y - rowH + 6, {
        size,
        color: muted,
      });
      y -= rowH + 10;
      return;
    }
    const all = o.total ? [...rows, o.total] : rows;
    all.forEach((row, ri) => {
      const isTotal = !!o.total && ri === rows.length;
      // Wrap only the first (description) column; others are short values.
      const first = wrap(String(row[0]), ws[0] - 12, size);
      const h = Math.max(rowH, first.length * (size + 3) + 6);
      if (y - h < BOTTOM) {
        newPage();
        headRow();
      }
      if (isTotal)
        page.drawRectangle({
          x: L,
          y: y - h,
          width: CW,
          height: h,
          color: accentSoft,
        });
      else if (ri % 2)
        page.drawRectangle({
          x: L,
          y: y - h,
          width: CW,
          height: h,
          color: fill,
        });
      let x = L;
      row.forEach((cell, i) => {
        const font = isTotal || cols[i].bold ? bold : regular;
        if (i === 0)
          first.forEach((ln, k) =>
            text(ln, x + 6, y - 6 - size - k * (size + 3) + 2, { size, font }),
          );
        else if (cols[i].align === "right")
          textRight(String(cell), x + ws[i] - 6, y - h + 6, { size, font });
        else text(String(cell), x + 6, y - h + 6, { size, font });
        x += ws[i];
      });
      y -= h;
    });
    page.drawLine({
      start: { x: L, y },
      end: { x: R, y },
      thickness: 0.6,
      color: rule,
    });
    y -= 14;
  }
  /** Vertical bar chart with labelled axis; readable in black and white. */
  function bars(
    data: { label: string; value: number }[],
    o: { height?: number; format?: (v: number) => string; every?: number } = {},
  ) {
    const h = o.height ?? 130;
    ensure(h + 40);
    const max = Math.max(1, ...data.map((d) => d.value));
    const top = y - 8,
      base = top - h,
      left = L + 46;
    const fmt = o.format ?? inr;
    for (let k = 0; k <= 4; k++) {
      const v = (max * k) / 4;
      const yy = base + (h * k) / 4;
      page.drawLine({
        start: { x: left, y: yy },
        end: { x: R, y: yy },
        thickness: k ? 0.3 : 0.8,
        color: k ? rule : ink,
      });
      textRight(fmt(v), left - 5, yy - 2.5, { size: 6.5, color: muted });
    }
    const slot = (R - left) / Math.max(1, data.length);
    const bw = Math.min(28, slot * 0.68);
    const every = o.every ?? Math.ceil(data.length / 16);
    const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
    data.forEach((d, i) => {
      const bh = (d.value / max) * h;
      const x = left + i * slot + (slot - bw) / 2;
      if (bh > 0)
        page.drawRectangle({
          x,
          y: base,
          width: bw,
          height: bh,
          color: i === peak ? accent : ink,
        });
      if (i % every === 0 || i === peak)
        text(d.label, x + bw / 2 - width(d.label, 6.3) / 2, base - 10, {
          size: 6.3,
          color: muted,
        });
    });
    y = base - 22;
  }
  /** Horizontal share bars: label, bar, value and share. */
  function shares(
    data: { label: string; value: number }[],
    o: { format?: (v: number) => string; limit?: number } = {},
  ) {
    const total = data.reduce((n, d) => n + Math.max(0, d.value), 0) || 1;
    const max = Math.max(1, ...data.map((d) => d.value));
    const fmt = o.format ?? inr;
    const labelW = 150,
      valueW = 110,
      barW = CW - labelW - valueW;
    for (const d of data.slice(0, o.limit ?? 12)) {
      ensure(16);
      text(wrap(d.label, labelW - 8, 8.4)[0], L, y - 10, { size: 8.4 });
      const w = Math.max(1, (Math.max(0, d.value) / max) * (barW - 6));
      page.drawRectangle({
        x: L + labelW,
        y: y - 12,
        width: w,
        height: 9,
        color: accent,
      });
      textRight(
        `${fmt(d.value)}  ${pct(Math.max(0, d.value) / total)}`,
        R,
        y - 10,
        { size: 8.4 },
      );
      y -= 16;
    }
    y -= 8;
  }
  function bullets(items: string[], o: { color?: typeof ink } = {}) {
    for (const it of items) {
      const lines = wrap(it, CW - 16, 9.5);
      ensure(lines.length * 14 + 4);
      page.drawCircle({ x: L + 4, y: y - 6.5, size: 1.8, color: accent });
      lines.forEach((ln, i) =>
        text(ln, L + 14, y - 10 - i * 14, { size: 9.5, color: o.color }),
      );
      y -= lines.length * 14 + 5;
    }
    y -= 4;
  }
  /** Plain-language finding under a chart or table. */
  function insight(t: string) {
    const lines = wrap(t, CW - 22, 9);
    ensure(lines.length * 13 + 14);
    page.drawRectangle({
      x: L,
      y: y - lines.length * 13 - 10,
      width: 2,
      height: lines.length * 13 + 6,
      color: accent,
    });
    lines.forEach((ln, i) =>
      text(ln, L + 12, y - 11 - i * 13, { size: 9, color: ink }),
    );
    y -= lines.length * 13 + 18;
  }

  /* ───── Data prepared once ───── */
  const m = r.current,
    p = r.prior;
  const prevLabel = `${longDate(r.previous.from)} – ${longDate(r.previous.to)}`;
  const g = margin(m);
  const gp = margin(p);
  const due = r.receivables.reduce((n, x) => n + x.due, 0);
  const payable = r.payables.reduce((n, x) => n + x.due, 0);
  const inputTax = m.inputTaxPurchases + m.inputTaxExpenses;
  const deadValue = r.deadStock.reduce((n, d) => n + d.mrpValue, 0);
  const avg = (x: ReportMetrics) => (x.bills ? x.gross / x.bills : 0);
  const days = r.previous.days;

  /* ───── Cover ───── */
  newPage();
  page.drawRectangle({ x: 0, y: H - 250, width: W, height: 250, color: ink });
  const mh = 64,
    mw = (mark.width / mark.height) * mh;
  page.drawImage(mark, { x: L, y: H - 120, width: mw, height: mh });
  text(business.brand.toUpperCase(), L + mw + 14, H - 84, {
    size: 20,
    font: bold,
    color: white,
  });
  text(business.tagline.toUpperCase(), L + mw + 14, H - 102, {
    size: 7.5,
    color: rgb(0.85, 0.71, 0.54),
  });
  text("Business Report", L, H - 178, { size: 34, font: bold, color: white });
  text(period.label, L, H - 212, {
    size: 15,
    color: rgb(0.85, 0.71, 0.54),
  });
  y = H - 290;
  const facts: [string, string][] = [
    ["Period", `${longDate(r.from)} – ${longDate(r.to)} (${days} days)`],
    ["Compared with", prevLabel],
    ["Reference", reference],
    ["Prepared", `${stamp(r.generatedAt)} by ${r.generatedBy}`],
    ["Business", `${business.legalName} · GSTIN ${business.gstin}`],
    ["Address", addressLine],
  ];
  for (const [k, v] of facts) {
    text(k.toUpperCase(), L, y, { size: 7, font: bold, color: muted });
    text(v, L + 110, y, { size: 10 });
    y -= 22;
  }
  y -= 10;
  text("CONTENTS", L, y, { size: 7, font: bold, color: accent });
  y -= 18;
  const contentsPage = page;
  const contentsTop = y;
  // Filled in at the end, once every section knows its page.

  /* ───── 1. At a glance ───── */
  section(
    1,
    "At a glance",
    `The most important numbers for ${period.label}, each compared with ${prevLabel}. A green triangle means the change is good for the business, a red one means it needs attention. The summary below explains the period in plain words.`,
  );
  tiles([
    {
      label: "Net sales",
      value: inr(m.netSales),
      trend: { now: m.netSales, before: p.netSales },
    },
    {
      label: "Bills",
      value: num(m.bills),
      trend: { now: m.bills, before: p.bills },
    },
    {
      label: "Average bill",
      value: inr(avg(m)),
      trend: { now: avg(m), before: avg(p) },
    },
    {
      label: "Items sold",
      value: num(m.units),
      trend: { now: m.units, before: p.units },
    },
    {
      label: "Gross margin",
      value:
        g.coverage >= 0.8 && g.grossMargin !== null
          ? pct(g.grossMargin, 1)
          : "Not yet known",
      note:
        g.coverage >= 0.8
          ? undefined
          : `costs known for ${pct(g.coverage)} of sales`,
      trend:
        g.coverage >= 0.8 &&
        gp.coverage >= 0.8 &&
        g.grossMargin !== null &&
        gp.grossMargin !== null
          ? { now: g.grossMargin, before: gp.grossMargin }
          : undefined,
    },
    {
      label: "GST collected",
      value: inr(m.netTax),
      trend: { now: m.netTax, before: p.netTax },
    },
    {
      label: "Money received",
      value: inr(m.received - m.refunded),
      trend: { now: m.received - m.refunded, before: p.received - p.refunded },
    },
    {
      label: "Customers owe",
      value: inr(due),
      note: `${r.receivables.length} unpaid bills at period end`,
    },
    {
      label: "Returns",
      value: inr(m.returnsValue),
      trend: { now: m.returnsValue, before: p.returnsValue, good: "down" },
    },
  ]);
  heading("Summary");
  bullets(summary(r));
  const acts = actions(r);
  if (acts.length) {
    heading("Needs attention", "Full list in section 10");
    bullets(acts.slice(0, 3).map((a) => a.text));
  }

  /* ───── 2. Sales performance ───── */
  section(
    2,
    "Sales performance",
    "How sales moved through the period. The bar chart shows the value billed each day (including GST); the darker bronze bar is the best day. The comparison table puts this period next to the previous one so growth or decline is clear.",
  );
  heading("Comparison with the previous period");
  const row = (
    label: string,
    a: number,
    b: number,
    f: (v: number) => string = inr,
  ) => {
    const ch = change(a, b);
    return [
      label,
      f(a),
      f(b),
      ch === null ? "–" : `${ch > 0 ? "+" : ""}${pct(ch, 1)}`,
    ];
  };
  table(
    [
      { head: "Measure", w: 34 },
      { head: "This period", w: 22, align: "right", bold: true },
      { head: "Previous", w: 22, align: "right" },
      { head: "Change", w: 14, align: "right" },
    ],
    [
      row("Gross sales (incl. GST)", m.gross, p.gross),
      row("Returns (credit notes)", m.returnsValue, p.returnsValue),
      row("Net sales", m.netSales, p.netSales),
      row("Net sales before GST", m.netTaxable, p.netTaxable),
      row("Bills", m.bills, p.bills, num),
      row("Average bill", avg(m), avg(p)),
      row("Items sold", m.units, p.units, num),
      row("Discounts given", m.discount, p.discount),
      row("Registered customers billed", m.customers, p.customers, num),
      row("Business (B2B) bills", m.b2bBills, p.b2bBills, num),
    ],
  );
  const dayMap = new Map(r.daily.map((d) => [d.date, d.gross]));
  const series: { label: string; value: number }[] = [];
  for (
    let t = Date.parse(`${r.from}T00:00:00Z`);
    t <= Date.parse(`${r.to}T00:00:00Z`);
    t += 86400000
  ) {
    const iso = new Date(t).toISOString().slice(0, 10);
    // Long periods: one bar per month, otherwise one per day.
    series.push({ label: iso, value: dayMap.get(iso) ?? 0 });
  }
  const monthly = series.length > 62;
  const chartData = monthly
    ? Object.entries(
        series.reduce<Record<string, number>>((acc, d) => {
          const k = d.label.slice(0, 7);
          acc[k] = (acc[k] ?? 0) + d.value;
          return acc;
        }, {}),
      ).map(([k, v]) => ({
        label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-IN", {
          month: "short",
          timeZone: "UTC",
        }),
        value: v,
      }))
    : series.map((d) => ({ label: d.label.slice(8, 10), value: d.value }));
  heading(
    monthly ? "Sales by month" : "Sales by day",
    "value billed, including GST",
    170,
  );
  bars(chartData);
  const sold = series.filter((d) => d.value > 0);
  const best = sold.reduce(
    (a, d) => (d.value > a.value ? d : a),
    sold[0] ?? { label: "", value: 0 },
  );
  if (sold.length)
    insight(
      `Sales were billed on ${sold.length} of ${series.length} days. The best ${monthly ? "day" : "day"} was ${longDate(best.label)} with ${inr(best.value)}. On days with sales, the shop averaged ${inr(sold.reduce((n, d) => n + d.value, 0) / sold.length)}.`,
    );
  heading("Busiest days of the week", undefined, 130);
  const wk = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    label: weekdayName(d).slice(0, 3),
    value: r.weekday.find((w) => w.dow === d)?.gross ?? 0,
  }));
  bars(wk, { height: 90, every: 1 });
  const hours = r.hourly.filter((h) => h.bills > 0);
  if (hours.length) {
    heading("Busiest hours", "bills started in each hour", 120);
    const span = Array.from(
      {
        length:
          Math.max(...hours.map((h) => h.hour)) -
          Math.min(...hours.map((h) => h.hour)) +
          1,
      },
      (_, i) => Math.min(...hours.map((h) => h.hour)) + i,
    );
    bars(
      span.map((h) => ({
        label: hourLabel(h),
        value: r.hourly.find((x) => x.hour === h)?.bills ?? 0,
      })),
      { height: 80, format: (v) => num(v), every: 1 },
    );
    const peakDay = [...r.weekday].sort((a, b) => b.gross - a.gross)[0];
    const peakHour = [...r.hourly].sort((a, b) => b.bills - a.bills)[0];
    insight(
      `${weekdayName(peakDay.dow)} brought the most sales, and ${hourLabel(peakHour.hour)} to ${hourLabel((peakHour.hour + 1) % 24)} was the busiest hour. Plan staff, deliveries and stock checks around these times.`,
    );
  }

  /* ───── 3. What sold ───── */
  section(
    3,
    "What sold",
    "Which ranges and products earned the money. Values are what customers paid (including GST) after returns. 'Share' is each line's part of the total, so you can see where the business really comes from.",
  );
  heading("Sales by category");
  shares(r.categories.map((c) => ({ label: c.category, value: c.revenue })));
  const top3 = r.categories.slice(0, 3).reduce((n, c) => n + c.revenue, 0);
  const catTotal = r.categories.reduce((n, c) => n + c.revenue, 0);
  if (r.categories.length > 3 && catTotal)
    insight(
      `The top three categories made ${pct(top3 / catTotal)} of sales. ${top3 / catTotal > 0.7 ? "Sales depend heavily on a few ranges; keep them well stocked and consider promoting the others." : "Sales are spread across many ranges, which lowers risk."}`,
    );
  heading("Top products", "by sales value");
  table(
    [
      { head: "Product", w: 44 },
      { head: "Code", w: 13 },
      { head: "Qty", w: 8, align: "right" },
      { head: "Sales", w: 15, align: "right", bold: true },
      { head: "Margin", w: 12, align: "right" },
    ],
    r.products
      .filter((x) => x.units > 0)
      .map((x) => [
        x.name,
        x.code,
        num(x.units),
        inr(x.revenue),
        x.cost === null || !x.taxable
          ? "cost n/a"
          : pct((x.taxable - x.cost) / x.taxable),
      ]),
  );
  if (r.customers.length) {
    heading("Top registered customers");
    table(
      [
        { head: "Customer", w: 46 },
        { head: "GSTIN", w: 26 },
        { head: "Bills", w: 8, align: "right" },
        { head: "Net sales", w: 18, align: "right", bold: true },
      ],
      r.customers.map((c) => [
        c.name,
        c.gstin || "–",
        num(c.bills),
        inr(c.net),
      ]),
    );
  }
  heading("Returns and discounts");
  table(
    [
      { head: "Reason for return", w: 60 },
      { head: "Credit notes", w: 18, align: "right" },
      { head: "Value", w: 20, align: "right" },
    ],
    r.returnReasons.map((x) => [x.reason, num(x.n), inr(x.total)]),
    { empty: "No returns in this period." },
  );
  insight(
    `${m.returns ? `Returns were ${inr(m.returnsValue)}, ${pct(m.gross ? m.returnsValue / m.gross : 0, 1)} of gross sales.` : "There were no returns."} Discounts given at the counter came to ${inr(m.discount)}${m.gross ? ` (${pct(m.discount / m.gross, 1)} of sales)` : ""}.${m.mrpValue > m.mrpBilled ? ` Customers paid ${inr(m.mrpValue - m.mrpBilled)} below MRP in total.` : ""}`,
  );

  /* ───── 4. Money in and out ───── */
  section(
    4,
    "Money in and out",
    "Where money came from and where it went. 'Received' counts payments taken in this period, even for older bills. 'Customers owe' is unpaid bills at the end of the period, grouped by how long they have been unpaid (ageing): the older a due, the harder it is to collect.",
  );
  heading("Payments by method");
  const recByMethod = new Map<string, { in: number; out: number; n: number }>();
  for (const x of r.methods) {
    const e = recByMethod.get(x.method) ?? { in: 0, out: 0, n: 0 };
    if (x.kind === "refund") e.out += x.amount;
    else e.in += x.amount;
    e.n += x.n;
    recByMethod.set(x.method, e);
  }
  const methodRows = [...recByMethod.entries()];
  table(
    [
      { head: "Method", w: 34 },
      { head: "Payments", w: 14, align: "right" },
      { head: "Received", w: 18, align: "right" },
      { head: "Refunded", w: 16, align: "right" },
      { head: "Net", w: 18, align: "right", bold: true },
    ],
    methodRows.map(([k, v]) => [
      methodLabel[k as keyof typeof methodLabel] ?? k,
      num(v.n),
      inr(v.in),
      inr(v.out),
      inr(v.in - v.out),
    ]),
    {
      total: [
        "Total",
        num(methodRows.reduce((n, [, v]) => n + v.n, 0)),
        inr(m.received),
        inr(m.refunded),
        inr(m.received - m.refunded),
      ],
    },
  );
  const cashShare =
    m.received && recByMethod.get("cash")
      ? recByMethod.get("cash")!.in / m.received
      : 0;
  if (m.received)
    insight(
      `${pct(cashShare)} of money came in as cash and ${pct(1 - cashShare)} digitally (UPI, card or bank). ${cashShare > 0.6 ? "A high cash share means daily drawer counts matter; bank the cash regularly." : "Digital payments leave a clear trail for reconciliation."}`,
    );
  heading("Customers owe (receivables ageing)", `as on ${longDate(r.to)}`);
  const ages = ageing(r.receivables);
  table(
    [
      { head: "Unpaid for", w: 40 },
      { head: "Bills", w: 20, align: "right" },
      { head: "Amount", w: 30, align: "right", bold: true },
    ],
    ages.map((a) => [a.label, num(a.bills), inr(a.amount)]),
    { total: ["Total", num(r.receivables.length), inr(due)] },
  );
  if (r.receivables.length) {
    heading("Largest unpaid bills");
    table(
      [
        { head: "Customer", w: 40 },
        { head: "Bill", w: 22 },
        { head: "Date", w: 16 },
        { head: "Days", w: 8, align: "right" },
        { head: "Due", w: 16, align: "right", bold: true },
      ],
      r.receivables
        .slice(0, 15)
        .map((x) => [
          x.customer || "Walk-in",
          x.number,
          longDate(x.date),
          num(x.age),
          inr(x.due),
        ]),
    );
  }
  heading("Purchases and suppliers");
  tiles([
    {
      label: "Purchase bills",
      value: num(m.purchases),
      trend: { now: m.purchasesValue, before: p.purchasesValue, good: "down" },
    },
    {
      label: "Purchases value",
      value: inr(m.purchasesValue),
      note: "including GST",
    },
    {
      label: "Owed to suppliers",
      value: inr(payable),
      note: `${r.payables.length} suppliers, at period end`,
    },
  ]);
  if (r.suppliers.length)
    table(
      [
        { head: "Supplier", w: 60 },
        { head: "Bills", w: 14, align: "right" },
        { head: "Purchases", w: 24, align: "right", bold: true },
      ],
      r.suppliers.map((s) => [s.supplier, num(s.bills), inr(s.total)]),
    );
  heading("Expenses by category");
  table(
    [
      { head: "Category", w: 46 },
      { head: "Entries", w: 14, align: "right" },
      { head: "GST paid", w: 18, align: "right" },
      { head: "Amount", w: 20, align: "right", bold: true },
    ],
    r.expenses.map((e) => [e.category, num(e.n), inr(e.gst), inr(e.amount)]),
    {
      total: r.expenses.length
        ? [
            "Total",
            num(m.expenses),
            inr(m.inputTaxExpenses),
            inr(m.expensesValue),
          ]
        : undefined,
      empty: "No expenses recorded in this period.",
    },
  );
  heading("Cash drawer");
  insight(
    m.shiftsClosed
      ? `${m.shiftsClosed} shifts were closed. ${m.shiftsMismatched ? `${m.shiftsMismatched} drawer counts did not match the expected cash, a net ${m.cashVariance < 0 ? "shortage" : "excess"} of ${inr2(Math.abs(m.cashVariance))}.` : "Every counted drawer matched the expected cash."}`
      : "No shifts were closed in this period, so drawer counts could not be checked.",
  );

  /* ───── 5. Profitability ───── */
  section(
    5,
    "Profitability",
    "An indicative profit view, before tax. Sales are taken before GST because GST belongs to the government. Cost of goods is what the sold items cost to buy; it is only known for products with a purchase cost recorded, so the 'coverage' line shows how complete this picture is. Treat it as a guide, not audited accounts.",
  );
  const costedSales = m.costedTaxable;
  const expensesExGst = m.expensesValue - m.inputTaxExpenses;
  table(
    [
      { head: "Line", w: 62 },
      { head: "This period", w: 19, align: "right", bold: true },
      { head: "Previous", w: 19, align: "right" },
    ],
    [
      ["Net sales before GST", inr(m.netTaxable), inr(p.netTaxable)],
      [
        "   of which: items with a known cost",
        inr(costedSales),
        inr(p.costedTaxable),
      ],
      ["Cost of those items", inr(m.cost), inr(p.cost)],
      ["Gross profit on costed items", inr(g.grossProfit), inr(gp.grossProfit)],
      [
        "Gross margin",
        g.grossMargin === null ? "–" : pct(g.grossMargin, 1),
        gp.grossMargin === null ? "–" : pct(gp.grossMargin, 1),
      ],
      [
        "Operating expenses (before GST)",
        inr(expensesExGst),
        inr(p.expensesValue - p.inputTaxExpenses),
      ],
    ],
    {
      total: [
        "Indicative operating result",
        g.coverage >= 0.8 ? inr(g.grossProfit - expensesExGst) : "Not reliable",
        gp.coverage >= 0.8
          ? inr(gp.grossProfit - (p.expensesValue - p.inputTaxExpenses))
          : "Not reliable",
      ],
    },
  );
  insight(
    g.coverage >= 0.8
      ? `Costs are known for ${pct(g.coverage)} of sales, so the margin above is a fair guide. Every ₹100 of sales (before GST) left about ₹${Math.round((g.grossMargin ?? 0) * 100)} after paying for the goods.`
      : `Costs are known for only ${pct(g.coverage)} of sales, so profit cannot be stated reliably. Record purchase bills (they set each product's cost automatically) or enter cost prices, and next month's report will show a full profit picture.`,
  );

  /* ───── 6. GST ───── */
  section(
    6,
    "GST summary",
    "Figures to help prepare GSTR-1 and GSTR-3B. Output GST is tax collected on sales (after returns). Input GST is tax paid on purchases and expenses, which can usually be claimed back. The 'indicative' payable is output minus input; your accountant must confirm eligibility against GSTR-2B before filing.",
  );
  heading("Output tax by rate");
  const rateRows = r.gstRates.map((x) => [
    `${x.rate / 100}%`,
    inr2(x.taxable),
    inr2(x.cgst),
    inr2(x.sgst),
    inr2(x.igst),
    inr2(x.cgst + x.sgst + x.igst),
  ]);
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst") =>
    r.gstRates.reduce((n, x) => n + x[k], 0);
  table(
    [
      { head: "GST rate", w: 14 },
      { head: "Taxable value", w: 20, align: "right" },
      { head: "CGST", w: 16, align: "right" },
      { head: "SGST", w: 16, align: "right" },
      { head: "IGST", w: 16, align: "right" },
      { head: "Total tax", w: 18, align: "right", bold: true },
    ],
    rateRows,
    {
      total: [
        "Total",
        inr2(sum("taxable")),
        inr2(sum("cgst")),
        inr2(sum("sgst")),
        inr2(sum("igst")),
        inr2(sum("cgst") + sum("sgst") + sum("igst")),
      ],
    },
  );
  heading("Indicative GST position");
  table(
    [
      { head: "Line", w: 70 },
      { head: "Amount", w: 30, align: "right", bold: true },
    ],
    [
      ["Output GST on sales (after returns)", inr2(m.netTax)],
      ["Input GST on purchases", inr2(m.inputTaxPurchases)],
      ["Input GST on expenses (as recorded)", inr2(m.inputTaxExpenses)],
    ],
    {
      total: [
        inputTax > m.netTax
          ? "Indicative credit carried forward"
          : "Indicative GST payable",
        inr2(Math.abs(m.netTax - inputTax)),
      ],
    },
  );
  heading("HSN summary (GSTR-1 Table 12)");
  table(
    [
      { head: "HSN", w: 16 },
      { head: "Rate", w: 12, align: "right" },
      { head: "Qty", w: 14, align: "right" },
      { head: "Taxable value", w: 30, align: "right" },
      { head: "Tax", w: 26, align: "right", bold: true },
    ],
    r.hsn.map((x) => [
      x.hsn || "Not set",
      `${x.rate / 100}%`,
      num(x.units),
      inr2(x.taxable),
      inr2(x.tax),
    ]),
  );
  heading("Business (B2B) invoices (GSTR-1 Table 4)");
  table(
    [
      { head: "Customer", w: 30 },
      { head: "GSTIN", w: 24 },
      { head: "Invoice", w: 18 },
      { head: "Date", w: 14 },
      { head: "Taxable", w: 16, align: "right" },
      { head: "Tax", w: 14, align: "right" },
    ],
    r.b2b.map((x) => [
      x.customer,
      x.gstin,
      x.number,
      longDate(x.date),
      inr2(x.taxable),
      inr2(x.tax),
    ]),
    { empty: "No bills to GST-registered customers in this period." },
  );

  /* ───── 7. Stock ───── */
  section(
    7,
    "Stock",
    "What is on the shelves. Stock figures are a snapshot taken when this report was generated, not on the last day of the period. 'At MRP' is what the stock would sell for; 'at cost' is what it cost, for products with a recorded cost. Dead stock is anything that has not sold in the 90 days to the period end.",
  );
  tiles([
    {
      label: "Products",
      value: num(r.stock.skus),
      note: `${num(r.stock.units)} units on hand`,
    },
    { label: "Stock value at MRP", value: inr(r.stock.atMrp) },
    {
      label: "Stock value at cost",
      value: r.stock.uncosted ? "Incomplete" : inr(r.stock.atCost),
      note: r.stock.uncosted
        ? `${r.stock.uncosted} products have no cost`
        : undefined,
    },
    {
      label: "Out of stock",
      value: num(r.stock.out),
      note: "products at zero",
    },
    {
      label: "Low stock",
      value: num(r.stock.low),
      note: "at or below their alert level",
    },
    {
      label: "Dead stock",
      value: num(r.deadStock.length),
      note: `${inr(deadValue)} at MRP`,
    },
  ]);
  if (r.deadStock.length) {
    heading("Largest dead stock", "no sale in 90 days, by value at MRP");
    table(
      [
        { head: "Product", w: 42 },
        { head: "Code", w: 14 },
        { head: "Qty", w: 10, align: "right" },
        { head: "Value at MRP", w: 18, align: "right", bold: true },
        { head: "Last sold", w: 16 },
      ],
      r.deadStock
        .slice(0, 15)
        .map((d) => [
          d.name,
          d.code,
          num(d.stock),
          inr(d.mrpValue),
          d.lastSold ? longDate(d.lastSold) : "Never",
        ]),
    );
    insight(
      `${pct(r.stock.atMrp ? deadValue / r.stock.atMrp : 0)} of stock value (at MRP) has not moved in 90 days. Money tied up in slow stock cannot be used to buy fast sellers.`,
    );
  }

  /* ───── 8. Enquiries and interest ───── */
  section(
    8,
    "Quotations and customer interest",
    "Early signs of future sales. Quotations are prices prepared for customers; 'won' means the customer bought. Product views count how often each product was opened on the website and catalogue, which shows what customers are looking at.",
  );
  tiles([
    {
      label: "Quotations",
      value: num(m.quotations),
      trend: { now: m.quotations, before: p.quotations },
    },
    { label: "Quoted value", value: inr(m.quotationsValue) },
    {
      label: "Won",
      value: `${num(m.quotationsWon)}${m.quotations ? ` (${pct(m.quotationsWon / m.quotations)})` : ""}`,
      note: inr(m.quotationsWonValue),
    },
  ]);
  if (r.salespeople.length) {
    heading("By salesperson");
    table(
      [
        { head: "Prepared by", w: 46 },
        { head: "Quotations", w: 16, align: "right" },
        { head: "Won", w: 12, align: "right" },
        { head: "Value", w: 24, align: "right", bold: true },
      ],
      r.salespeople.map((s) => [
        s.name,
        num(s.quotes),
        num(s.won),
        inr(s.value),
      ]),
    );
  }
  if (r.views.length) {
    heading("Most viewed products");
    table(
      [
        { head: "Product", w: 64 },
        { head: "Code", w: 18 },
        { head: "Views", w: 16, align: "right", bold: true },
      ],
      r.views.map((v) => [v.name, v.code, num(v.views)]),
    );
  }

  /* ───── 9. Checks ───── */
  section(
    9,
    "Checks and data quality",
    "Automatic checks on the records behind this report. 'OK' means nothing needs doing; 'Review' means the item should be looked at before the period is closed or the GST return is filed.",
  );
  const checks: [string, boolean, string][] = [
    [
      "Invoice number series",
      !r.numberGaps,
      r.numberGaps
        ? `${r.numberGaps} reserved numbers unused this financial year`
        : "No gaps",
    ],
    [
      "Sales beyond recorded stock",
      !r.shortfallBills,
      r.shortfallBills ? `${r.shortfallBills} bills` : "None",
    ],
    [
      "Bills made offline and synced later",
      true,
      m.offline ? `${m.offline} bills (all synced)` : "None",
    ],
    [
      "Cash drawer counts",
      !m.shiftsMismatched,
      m.shiftsMismatched
        ? `${m.shiftsMismatched} did not match`
        : "All matched",
    ],
    [
      "Products without GST rate",
      !r.hygiene.noGst,
      `${r.hygiene.noGst} of ${r.hygiene.products}`,
    ],
    [
      "Products without HSN code",
      !r.hygiene.noHsn,
      `${r.hygiene.noHsn} of ${r.hygiene.products}`,
    ],
    [
      "Products without purchase cost",
      r.hygiene.noCost / Math.max(1, r.hygiene.products) < 0.2,
      `${r.hygiene.noCost} of ${r.hygiene.products}`,
    ],
    [
      "Products without photo",
      r.hygiene.noPhoto / Math.max(1, r.hygiene.products) < 0.1,
      `${r.hygiene.noPhoto} of ${r.hygiene.products}`,
    ],
  ];
  const rowH = 22;
  for (const [label, ok, detail] of checks) {
    ensure(rowH);
    page.drawCircle({
      x: L + 7,
      y: y - 11,
      size: 4.5,
      color: ok ? good : bad,
    });
    text(label, L + 20, y - 14, { size: 9.5 });
    text(ok ? "OK" : "Review", L + 230, y - 14, {
      size: 9,
      font: bold,
      color: ok ? good : bad,
    });
    text(wrap(detail, R - (L + 285), 9)[0], L + 285, y - 14, {
      size: 9,
      color: muted,
    });
    page.drawLine({
      start: { x: L, y: y - rowH + 2 },
      end: { x: R, y: y - rowH + 2 },
      thickness: 0.4,
      color: rule,
    });
    y -= rowH;
  }

  /* ───── 10. Action points ───── */
  section(
    10,
    "Action points",
    "What to do next, most important first. Each point comes from the figures in this report. High means act this week; Medium this month; Low when convenient.",
  );
  if (!acts.length) paragraph("Nothing needs attention. Well done.");
  acts.forEach((a, i) => {
    const lines = wrap(a.text, CW - 92, 9.5);
    const h = lines.length * 14 + 14;
    ensure(h + 6);
    page.drawRectangle({
      x: L,
      y: y - h,
      width: CW,
      height: h,
      borderColor: rule,
      borderWidth: 0.7,
    });
    const tag = a.level.toUpperCase();
    page.drawRectangle({
      x: L + 10,
      y: y - 22,
      width: 58,
      height: 14,
      color: a.level === "high" ? bad : a.level === "medium" ? accent : muted,
    });
    text(tag, L + 39 - width(tag, 7, bold) / 2, y - 18, {
      size: 7,
      font: bold,
      color: white,
    });
    lines.forEach((ln, k) =>
      text(`${k ? "" : `${i + 1}. `}${ln}`, L + 80, y - 18 - k * 14, {
        size: 9.5,
      }),
    );
    y -= h + 6;
  });

  /* ───── 11. Notes, glossary and sign-off ───── */
  section(
    11,
    "Notes, glossary and sign-off",
    "How the figures were worked out, what the terms mean, and space to sign this copy for your records.",
  );
  heading("How the figures were prepared");
  bullets([
    `All figures come from the Lenore billing records for ${longDate(r.from)} to ${longDate(r.to)}, compared with ${prevLabel}.`,
    "Sales are bills dated in the period. Returns are credit notes issued in the period, even when the original bill was earlier. Net sales = sales minus returns.",
    "Amounts are in Indian rupees, rounded to the nearest rupee except in the GST section, which shows paise.",
    "Stock and product checks are a snapshot at the time of generation. Receivables and supplier dues are as on the last day of the period.",
    "Profit is indicative: it uses the cost recorded on each bill line and excludes depreciation, interest, income tax and owner drawings. This is a management report, not audited financial statements.",
  ]);
  heading("Glossary");
  for (const [term, meaning] of glossary) {
    const lines = wrap(meaning, CW - 130, 9);
    ensure(lines.length * 13 + 6);
    text(term, L, y - 10, { size: 9, font: bold });
    lines.forEach((ln, i) =>
      text(ln, L + 130, y - 10 - i * 13, { size: 9, color: muted }),
    );
    y -= lines.length * 13 + 6;
  }
  heading("Sign-off", undefined, 130);
  const boxW = (CW - 20) / 3;
  ["Prepared by", "Reviewed by", "Approved by"].forEach((label, i) => {
    const x = L + i * (boxW + 10);
    page.drawRectangle({
      x,
      y: y - 104,
      width: boxW,
      height: 104,
      borderColor: rule,
      borderWidth: 0.8,
    });
    text(label.toUpperCase(), x + 10, y - 16, {
      size: 7,
      font: bold,
      color: muted,
    });
    for (const [k, at] of [
      ["Name", 44],
      ["Signature", 68],
      ["Date", 92],
    ] as const) {
      text(k, x + 10, y - at, { size: 8, color: muted });
      page.drawLine({
        start: { x: x + 58, y: y - at - 2 },
        end: { x: x + boxW - 10, y: y - at - 2 },
        thickness: 0.5,
        color: rule,
      });
    }
  });
  y -= 120;

  /* ───── Contents, running header and footer on every page ───── */
  page = contentsPage;
  let cy = contentsTop;
  for (const c of contents) {
    text(c.title, L, cy, { size: 10 });
    const pn = String(c.page);
    textRight(pn, R, cy, { size: 10, font: bold });
    const dotsFrom = L + width(c.title, 10) + 8,
      dotsTo = R - width(pn, 10, bold) - 8;
    for (let x = dotsFrom; x < dotsTo; x += 4)
      page.drawCircle({ x, y: cy + 3, size: 0.4, color: faint });
    cy -= 17;
  }
  const total = pages.length;
  pages.forEach((pg, i) => {
    page = pg;
    if (i > 0) {
      text(
        `${business.legalName} · Business report · ${period.label}`,
        L,
        H - 40,
        {
          size: 7.5,
          color: muted,
        },
      );
      textRight(reference, R, H - 40, { size: 7.5, font: bold, color: muted });
      page.drawLine({
        start: { x: L, y: H - 46 },
        end: { x: R, y: H - 46 },
        thickness: 0.5,
        color: rule,
      });
    }
    page.drawLine({
      start: { x: L, y: 46 },
      end: { x: R, y: 46 },
      thickness: 0.5,
      color: rule,
    });
    text(
      `Generated ${stamp(r.generatedAt)} · Confidential: for ${business.legalName} records`,
      L,
      34,
      { size: 7, color: muted },
    );
    textRight(`Page ${i + 1} of ${total}`, R, 34, {
      size: 7.5,
      font: bold,
      color: muted,
    });
  });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
