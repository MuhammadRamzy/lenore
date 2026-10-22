# 0008 · Business reports as filed records

Date: 2026-10-22 · Status: accepted

## Context

The owners want a monthly, quarterly and yearly report of the kind an analyst or CA would prepare, readable by anyone, and they print and file each one as a record.

## Decision

- **One endpoint gathers the period** (`GET /api/admin/reports/business`): headline metrics for the period and for the comparison period, plus the detail every section needs. Whole months, quarters and financial years compare with the same calendar span before; any other range with the same number of days before.
- **Net sales follow accounting practice:** bills dated in the period minus credit notes issued in the period.
- **Plain-language analysis is pure code** (`src/report.ts`): the summary sentences, ageing buckets and prioritised action points are derived only from the figures, so they are testable and never invented.
- **The PDF is drawn in the browser** with pdf-lib (`src/client/admin/report-pdf.ts`), print-first: A4, wide binding margin, black-and-white safe, reference and page X of Y on every page, a "How to read this" box per section, glossary, method notes and a sign-off block.
- **Archive is append-only** (migration 0012): a reference such as `LT-RPT-2026-10` is reserved before drawing so it prints on every page; regenerating adds `-v2`, and a saved PDF can never be replaced.

## Consequences

- Stock figures are a snapshot at generation time; the report says so.
- Profit is marked "not reliable" until purchase costs cover at least 80% of sales.
- Reports are admin-only, covered by the role access matrix test.
