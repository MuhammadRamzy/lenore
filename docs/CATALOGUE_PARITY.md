# Wetta information, Lenore presentation

The user confirmed that catalogue information should match Wetta, with better presentation. This is field and workflow parity, not a request to import Wetta's product records, images, prices or stock.

| Wetta information                   | Lenore implementation                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Item code                           | `code`, displayed on cards, product detail, basket and quotations                                                               |
| Description/product name            | `name` for title; separate `description` for longer details                                                                     |
| Category                            | Editable category, catalogue filter and landing range navigation                                                                |
| Suggested MRP                       | `pricePaise`, integer paise; explicitly labelled suggested MRP, separate from future ERP rates                                  |
| Stock count and status              | Current local stock count, derived availability and per-product low-stock threshold                                             |
| Last updated                        | Detail panel timestamp; updates on product/media/stock changes                                                                  |
| Product photograph                  | Independent validated R2 image upload                                                                                           |
| Feature/specification poster        | Independent second image, gallery controls and full-size image link                                                             |
| Product sharing                     | Native text/photo/poster sharing when supported, WhatsApp text fallback                                                         |
| Quantity entry                      | Typed quantity and plus/minus controls; range validation                                                                        |
| Quotation customer name/phone/notes | Persistent local customer draft and server enquiry submission                                                                   |
| Item amount and quotation totals    | Integer-paise calculations, total quantity and suggested MRP total; unknown prices remain unconfirmed                           |
| PDF quotation                       | Downloadable paginated PDF, customer details, code/name, MRP, quantity, amounts, totals and disclaimer; English/Malayalam fonts |
| WhatsApp quotation                  | Generic recipient picker, configured Lenore number, entered client number and custom number                                     |
| Copy and print                      | Copy full quotation text and print/save-browser-PDF option                                                                      |
| Draft persistence                   | Browser-persisted items/customer fields; explicit clear with undo; sharing does not falsely mark delivery as completed          |
| Admin visibility                    | Published/draft controls and separate management workspace                                                                      |

Not yet copied as requirements: existing brand landing copy, contacts, product data, Tally sync, shared Wetta/Waterlife branding, catalogue password policy, PWA installation, category-level threshold overrides and last-sent archival semantics. Real Lenore data/assets and public-versus-dealer access policy still need owner input. ERP/offline POS integration is explicitly deferred.
