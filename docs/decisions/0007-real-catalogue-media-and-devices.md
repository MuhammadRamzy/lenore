# 0007 · Real catalogue, image pipeline, devices and test isolation

Date: 2026-10-22 · Status: accepted

## Context

The owner moved from sample data to the real Wetta catalogue (308 products, 352 photos and posters, read once from the Wetta D1/R2 into the local database). Uploads arrive as phone JPEGs and PNGs of very different sizes, and product grids on the website, catalogue PWA and POS were downloading full-size photos. The counter needs a USB receipt printer, any A4/laser printer and barcode scanning, including phone cameras.

## Decision

- **Every upload becomes WebP in the browser** (`src/client/webp.ts`): longest side 1600 px (posters 2400 px), EXIF rotation applied, JPEG fallback where a browser cannot encode WebP. The server still validates the bytes (JPEG, PNG or WebP only, 5 MB).
- **A 600 px thumbnail sits beside each image** in R2 as `<key>.600`, uploaded best-effort after the main image. `GET /api/media/:key?w=600` serves it and falls back to the original. Grids use `srcset`, so detail views still get the full photo. Replacing an image deletes both.
- **Sample data only seeds an empty database.** Demo mode and its "Preview" labels are off locally and removed from the UI.
- **Browser tests run on their own database** (`.wrangler/e2e`, port 8788) so they never touch real local products.
- **Printing:** 80 mm and A4 bills go through the system print dialog (any installed printer); direct ESC/POS over Web Serial is an option for USB receipt printers, remembered between sessions. Counters choose a default format and optional auto-print.
- **Scanning:** one shared camera scanner (`src/client/scanner.tsx`, BarcodeDetector) for the catalogue, POS, stock count and product lookup. USB/Bluetooth scanners type into the nearest search box anywhere on those screens.

## Consequences

- Grids and the home page dropped from about 1 MB to about 250 KB of images.
- Camera scanning needs Chrome on Android or desktop Chrome/Edge; iPhone Safari users type the code or use a Bluetooth scanner.
- Thumbnails for images uploaded before this change must be backfilled once (done locally); production needs the same backfill after its first import.
