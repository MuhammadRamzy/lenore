# Lenore finance implementation

Codex · 2026-10-19 · Research and implementation plan

## Business scope

Lenore is India-based and exports to Qatar, Dubai/UAE and other Middle East destinations. The user requested working finance modules for revenue, profit and taxes after the architectural redesign. This expands the earlier catalogue-only scope; it does not authorize migration or modification of live offline billing. Finance records are an independent management subledger with explicit source references. Prepare manual entry and repeatable file imports for already-issued documents; do not issue competing POS invoices or post stock twice.

INR is the reporting currency. Export invoices retain destination, source currency/value, exchange-rate evidence, LUT/IGST treatment, shipping bill/port and realisation tracking. Do not infer overseas VAT registrations or obligations merely from an export destination. Company GSTIN, state, IEC, LUT evidence and actual source documents still need setup.

## Research-backed definitions

- Recognise source sales separately from cash collections. Cost of sold inventory belongs against the related sales; purchases are not all immediately expensed. IAS 2 describes this distinction and acceptable inventory cost assignment. Here, imported/documented COGS is an explicit source amount; missing cost makes profit unavailable, never an invented zero cost. [IFRS Foundation: IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).
- Show cash receipts and payments separately from the trading result. This workspace reports recorded operating cash movement, not a bank balance without opening balances/reconciliation. [IFRS Foundation: IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows.html/).
- For India, maintain outward-supply records and adjustments separately from purchase/input-tax review. GSTR-1 concerns outward supplies; GSTR-2B supports checking ITC for GSTR-3B. Unreviewed purchase tax must not automatically become claimable credit. [GSTN: GSTR-1](https://tutorial.gst.gov.in/userguide/returns/GSTR_1.htm), [GSTN: GSTR-2B FAQ](https://tutorial.gst.gov.in/userguide/returns/FAQ_gstr2b.htm).
- Exports need a distinct source treatment: LUT/bond without IGST or recorded export IGST, with supporting shipping evidence. Eligibility/refund conditions require actual source evidence; this app does not decide refund entitlement. [CBIC: IGST Act section 16](https://taxinformation.cbic.gov.in/content-page/explore-act/1000624/1000001/section%2016/ACTS), [CBIC: refund rules](https://cbic-gst.gov.in/gst-refund-rules.html).
- Retain IEC and export documentation references. Track proceeds and bank realisation evidence; due dates are explicitly entered rather than hardcoding changing legal deadlines. [DGFT: IEC manual](https://content.dgft.gov.in/Website/IEC_Manual_V4.1.pdf), [RBI: export master direction](https://www.rbi.org.in/SCRIPTs/BS_ViewMasterDirections.aspx?id=10200).

These sources ground management reporting choices. They are not a claim that this independent subledger constitutes statutory accounts or filed returns. GSTN pages were search-index accessible but direct fetches failed during research. No product tax rate, automatic ITC set-off, income-tax liability or statutory deadline is inferred.

## Modules and implementation contract

| Module | Working behaviour |
| --- | --- |
| Finance overview | Date-range net revenue, COGS completeness, gross profit, operating expenses/result before income tax, recorded collections/payments and open balances. |
| Sales register | Record source domestic/export sales with document reference, party, net amount and tax components; retain provenance and source currency. Quotes/enquiries never count as revenue. |
| Purchases and expenses | Separate inventory purchases from operating expenses; capture category, vendor, source bill, due date and input-tax review. |
| Credit notes and returns | Source-linked sales/purchase credits with cumulative component limits, original party/tax treatment and correct signs. No stock mutations. |
| Collections and payments | Partial settlements/refunds, actual bank amount versus allocated INR value, date/method/reference, overpayment protection and immutable history. |
| Receivables/payables | Outstanding balances after credits/payments, ageing and due dates, including refunds due; no hidden offsets between parties. |
| GST workbook | Separate CGST/SGST/IGST output, reviewed eligible inputs, pending review and ineligible inputs; source register exports. No false “tax payable” obtained by blindly netting heads. |
| Exports | Destination/currency metadata, LUT/IGST source classification, shipping/port/LUT references, realisation evidence and missing-document exceptions. |
| Tax obligations | Explicitly entered GST/income-tax/TDS/other tasks with period, due date, filing/payment references and status; no fabricated legal calendar. |
| Accountant handoff | Filtered, spreadsheet-safe CSV exports, repeatable validated imports, duplicate detection and clear source IDs. |
| Controls | Authenticated access, exact integer money, request idempotency, audit events, closed-period protection, append-only settlement history and explicit void reasons. |

## Data and safety

Finance records snapshot already-issued source documents. All accounting amounts are INR paise entered from source records; foreign original values and rate evidence are retained separately. Actual bank INR receipts can differ from the allocated invoice INR amount; that difference is reported as recorded realised exchange/settlement variance, not silently added to revenue. No stock, billing invoice or public catalogue mutation occurs.

Posted monetary fields are immutable. Missing sale cost can be completed once with a reason in an open period. Corrections use linked credits or an explicit void where no settlement/credit depends on the record. Period closure blocks backdated financial changes. Imports validate the whole batch before committing; duplicates with changed content are errors, not overwrites.

## Verification and readiness

Use workerd/D1 tests for auth, exact rounding, profit completeness, date boundaries, credits, partial collections, refunds, concurrent overpayment attempts, import retries/conflicts, CSV injection, period locks and export treatment. Exercise the finance UI on desktop/mobile, keyboard entry and failure states. Retest existing catalogue/inventory flows. Live operation still needs actual company/tax setup, authoritative source records, opening-balance/accountant review and production resources. Live ERP sync requires a separately authenticated interface to the existing billing app; no such interface or live credentials are currently supplied.
