# Architectural redesign finish review

Codex · 2026-10-19 · Independent finish review

## 1. Disposition

**fix** — the selected architectural direction is present and coherent, but two visible image-treatment defects require one bounded correction batch. This is a review of the current implementation, not approval of a comp and not a repeat of the superseded surface-split verdict.

## 2. Evidence checked

- Read `PRODUCT.md`, ADR `docs/decisions/0003-architectural-redesign.md`, project status/handoff, the incumbent `DESIGN.md`, and Impeccable's craft floor. Treated ADR 0003 and the user's selected direction as authority; the old public design documentation is pending replacement.
- Opened all ten supplied renders in `.impeccable/review/`: `landing-desktop.png`, `landing-mobile.png`, `catalogue-desktop.png`, `catalogue-mobile.png`, `detail-desktop.png`, `detail-mobile.png`, `enquiry-desktop.png`, `enquiry-mobile.png`, `desktop.png`, and `mobile.png`. Desktop capture viewport is 1440 × 1000; mobile is 390 × 844. Full-page captures extend below those viewport heights. The enquiry captures show the panel from its top.
- Inspected `src/client/public.tsx`, `src/client/architecture.css`, relevant shared rules in `src/client/styles.css`, `src/client/quote-actions.tsx`, and `src/client/quotation.ts`. The public media branches prioritize uploaded photo/poster media; generated product images require demonstration mode and one of four known demonstration SKUs. Unknown prices produce an unknown total, rather than a fabricated zero.
- Read the supplied detector result at `/tmp/lenore-redesign-detector.json`: 78 advisory findings against superseded design metadata, zero non-advisory findings, as reported by the build thread. Did not rerun the detector. The reported 7/7 asset provenance scan and 25 API/7 browser checks are supporting build evidence, not tests performed by this reviewer.

## 3. Material findings

### F1 · P2 · Desktop product detail cuts off the product

**Evidence:** `detail-desktop.png` cuts off the mixer's upper spout and lower base. The same product is substantially complete in `detail-mobile.png`. `architecture.css:430` applies `object-fit: cover` to generated sample images inside the fixed 300px-high detail frame (`styles.css:997`), so the wider desktop frame crops a portrait product image.

**Impact:** Opening the detailed product view should reveal the complete object. The current detail view removes useful visual information that the catalogue card showed.

**Bounded fix:** Scope a contain-fit treatment, or a proportionally taller frame, to generated images inside `.detail-visual`. Keep the product and its disclosure label fully visible and retain the existing contain-fit behavior for uploaded product photography and specification posters. Catalogue crops need not change to resolve this finding.

**Acceptance:** Desktop and mobile detail recaptures show the complete mixer silhouette, with no part cut off by the image frame and no provenance-label collision.

### F2 · P2 · Mobile catalogue disclosure and navigation icon overlap

**Evidence:** In `catalogue-mobile.png`, the bottom-right arrow sits over the final words of the sample-image disclosure on each product card. `architecture.css:435` anchors the label at bottom-left with no reserved right-hand space; `architecture.css:445` places the arrow on the same bottom line. At the 168px card width their occupied areas intersect.

**Impact:** The required demonstration disclosure becomes harder to read, and the image corner appears visibly unfinished across all four products.

**Bounded fix:** Reserve a separate area for the arrow, move it to the top-right corner, or allow the label to wrap within a width that excludes the icon. Preserve the full disclosure text and its contrast. Do not solve the collision by reducing its already small type.

**Acceptance:** Mobile catalogue recapture shows the entire illustrative/AI disclosure on every sample card, with clear space between label and navigation icon. Confirm the same arrangement on desktop.

## 4. Direction and floor assessment

The buyer experience carries the chosen architectural luxury direction: a dominant warm-stone bathroom photograph, charcoal composition, quiet limestone surfaces, Marcellus display hierarchy and restrained working typography. The mobile hero recomposes around the image and a readable text block. Category browsing is clear, and the catalogue maintains product code, price qualification and availability without turning the buyer surface into a staff table. There are no extraneous eyebrows, invented performance metrics or unsupported luxury claims in the inspected rendering.

The staff overview has a distinct operational system: dark navigation, cool white records, sans-serif task headings, direct stock exceptions and actionable readiness rows. Its mobile composition stacks the working regions without document-level horizontal overflow in the supplied capture. This satisfies the industrial/productivity direction at the overview scope shown.

The visible panels preserve readable stock details and honest quotation qualifications. The share/enquiry area matches the buyer palette; unpriced lines and the total remain explicitly subject to confirmation. Shared source includes focus styling, selection/caret styling, tabular data numerals and reduced-motion handling; the hero has one authored brightness/scale reveal. Those source observations do not substitute for live interaction or measured contrast verification. F1 and F2 are the material floor failures in the supplied evidence.

## 5. Limits

This reviewer had screenshot and source access, without a browser session. No live interaction, focus traversal, measured contrast, zoom/reflow, motion playback, real uploaded-media state or downloaded PDF rendering was independently certified. The single mobile detail/enquiry viewport shows only the top portion of scrollable panels; source inspection confirms the remaining controls exist but does not verify their scrolled rendering. Admin evidence covers its overview, not every management module.

There is no approved comp, quality-bar board or visual-diff specification, so this review assesses the pinned written direction and rendered craft rather than pixel fidelity. Real catalogue data, approved photographs, deployment readiness and the newly requested finance modules are outside this redesign review. No app source was changed by the reviewer. After the two fixes, return the recaptured matrix for a verdict pass scoring F1 and F2; refresh the superseded design documentation as part of the root handoff.

## Verdict pass 1 · Codex · 2026-10-19

**Disposition: fix.** This pass scores F1 and F2 only. Opened the replacement desktop/mobile detail and catalogue captures and inspected the corresponding CSS corrections. No new issue hunt or functional certification was performed.

| Finding | Score | Evidence and remaining action |
| --- | --- | --- |
| F1 · Complete detail product image | **resolved** | Contain-fit now shows the complete mixer silhouette on desktop and mobile. The disclosure remains visible. |
| F2 · Mobile disclosure/icon collision | **partial** | Reserved label width and wrapping remove the collision; desktop remains clear. However, the mobile correction reduces the disclosure from 9px to 8px (`architecture.css:797`), contrary to the original finding's explicit readability requirement. Restore at least the previous 9px while retaining the reserved width and wrapping, then recapture the mobile catalogue. |

The builder reports seven browser checks including axe passed after the changes; those are not independently rerun by this reviewer. Finance remains outside scope.

## Verdict pass 2 · Codex · 2026-10-19

**Disposition: ship — F1 and F2 resolved at this fix-list scope.** Opened the final `catalogue-mobile.png` and inspected its targeted CSS rule; the builder reports this 8px-to-9px correction is the only source change since pass 1.

| Finding | Final score | Evidence |
| --- | --- | --- |
| F1 · Complete detail product image | **resolved** | Pass 1's desktop/mobile contain-fit evidence remains applicable; the final correction does not touch detail images. |
| F2 · Mobile disclosure/icon collision | **resolved** | Final mobile capture shows every full disclosure wrapped separately from its arrow. The targeted CSS restores 9px text while retaining reserved width and spacing. Desktop treatment is unchanged from the clear pass-1 capture. |

This verdict closes the two material findings from the full redesign review. It does not expand the original screenshot/source scope, independently certify functional tests, or assess finance modules.
