---
name: Lenore
description: Architectural luxury for buyers and a separate industrial staff workspace.
colors:
  public-paper: "#f7f5f0"
  public-white: "#fffefa"
  public-ink: "#282620"
  public-muted: "#6a655c"
  public-line: "#dcd6cb"
  public-accent: "#785b3b"
  public-sage: "#ece7dd"
  public-olive: "#39382f"
  admin-paper: "#f3f5f7"
  admin-white: "#ffffff"
  admin-ink: "#1c2834"
  admin-muted: "#506071"
  admin-line: "#cdd5df"
  admin-sage: "#e9eef4"
  admin-olive: "#254563"
  admin-accent: "#315f85"
  admin-sidebar: "#202a34"
  danger: "#9c3529"
  badge-live-bg: "#e9f0e2"
  badge-live-text: "#406134"
  badge-low-bg: "#f6ecd9"
  badge-low-text: "#80511c"
  badge-out-bg: "#f7e9e4"
  badge-out-text: "#953d31"
  badge-draft-bg: "#eeefe9"
  badge-draft-text: "#606658"
  public-selection: "#e9e2d6"
  public-image-ground: "#ece8df"
  public-hero-text: "#fffaf1"
  public-hero-emphasis: "#d7c2a1"
  public-hero-action: "#f7f3e9"
  public-hero-action-hover: "#dfd2bb"
  admin-nav-text: "#bdc9d5"
  admin-nav-selected: "#f0f4f8"
  admin-nav-hover: "#344352"
typography:
  public-display:
    fontFamily: '"Marcellus", serif'
    fontSize: clamp(44px, 3.7vw, 58px)
    fontWeight: 400
    lineHeight: 1.13
    letterSpacing: -0.035em
  public-headline:
    fontFamily: '"Marcellus", serif'
    fontSize: clamp(38px, 3.8vw, 56px)
    fontWeight: 400
    lineHeight: 1.17
    letterSpacing: -0.03em
  public-panel-title:
    fontFamily: '"Marcellus", serif'
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.035em
  body:
    fontFamily: '"Manrope", sans-serif'
    fontSize: 14px
    lineHeight: 1.6
  admin-title:
    fontFamily: '"Manrope", sans-serif'
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.035em
  admin-section:
    fontFamily: '"Manrope", sans-serif'
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  admin-label:
    fontFamily: '"Manrope", sans-serif'
    fontSize: 13px
    fontWeight: 600
  public-catalogue-title:
    fontFamily: '"Marcellus", serif'
    fontSize: clamp(44px, 4.3vw, 64px)
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.035em
  public-product-title:
    fontFamily: '"Manrope", sans-serif'
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.5
rounded:
  public-control: 0px
  public-field: 0px
  admin-control: 3px
  admin-surface: 0px
  admin-thumbnail: 2px
  admin-signin: 4px
spacing:
  field-gap: 7px
  action-gap: 8px
  admin-section-gap: 20px
  admin-gutter: 24px
  panel-inset: 35px
  public-section: 100px
  public-mobile-gutter: 22px
components:
  public-button-primary:
    backgroundColor: "{colors.public-ink}"
    textColor: "{colors.public-white}"
    rounded: "{rounded.public-control}"
    padding: 13px 19px
  public-button-primary-hover:
    backgroundColor: "{colors.public-olive}"
  public-button-secondary:
    backgroundColor: "{colors.public-white}"
    textColor: "{colors.public-ink}"
    rounded: "{rounded.public-control}"
    padding: 13px 19px
  public-field:
    backgroundColor: "{colors.public-white}"
    textColor: "{colors.public-ink}"
    rounded: "{rounded.public-field}"
    padding: 10px 12px
  admin-button-primary:
    backgroundColor: "{colors.admin-ink}"
    textColor: "{colors.admin-white}"
    rounded: "{rounded.admin-control}"
    padding: 12px 19px
  admin-field:
    backgroundColor: "{colors.admin-white}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.admin-control}"
    padding: 10px 12px
  admin-navigation-selected:
    backgroundColor: "{colors.admin-nav-selected}"
    textColor: "{colors.admin-ink}"
    rounded: "{rounded.admin-control}"
    padding: 11px 13px
  admin-card:
    backgroundColor: "{colors.admin-white}"
    rounded: "{rounded.admin-surface}"
  public-button-hero:
    backgroundColor: "{colors.public-hero-action}"
    textColor: "{colors.public-ink}"
    rounded: "{rounded.public-control}"
    padding: 13px 19px
  public-category-selected:
    backgroundColor: "{colors.public-selection}"
    textColor: "{colors.public-ink}"
    rounded: "{rounded.public-control}"
    padding: 12px 14px
---

# Design System: Lenore

## Overview

**Creative North Star: "Architectural luxury, working precision"**

Buyer surfaces pair warm limestone, charcoal planes and restrained bronze with strong photography. Marcellus gives display headings an architectural cadence; Manrope keeps product information and actions precise. Square edges, fine rules and generous spacing let materials and merchandise lead.

Staff surfaces use a separate industrial system: dark slate navigation, cool white working regions, compact Manrope hierarchy and ruled records. Customer quotations adapt the buyer identity to white paper and bilingual Noto typography. The supplied Lenore logo remains the binding identity asset across these surfaces.

This records the implemented direction selected by the user after rejecting the original interface, as captured in ADR 0003. That choice supersedes the old botanical ivory/Cormorant buyer treatment. Implementation is the visual source of truth; no approved comp or separate quality-bar board is claimed.

**Key Characteristics:**

- Warm stone, charcoal and bronze buyer materials.
- Photographic emphasis with explicit illustrative provenance.
- Architectural display type and precise working typography.
- Separate, dense staff records with clear operational states.

## Colors

### Primary

Buyer charcoal anchors text, actions and dark composition planes; bronze marks emphasis and focus. Hero ivory supports readable reversed text, while the softer stone emphasis tone distinguishes the second display line. Staff ink anchors records and actions; blue remains the staff focus and secondary-action accent.

### Neutral

Limestone paper and warm white distinguish buyer pages, panels and fields. Stone tints support image backgrounds and selected categories; warm rules divide information without adding chrome. Staff paper, white, cool rules and a dark slate sidebar define the working regions. Selected staff navigation reverses to a light fill with dark text; unselected navigation uses muted cool text.

Live, low, out and draft status pairs retain explicit text labels alongside their green, amber, red and neutral cues. Danger remains shared. Frontmatter contains the normative values. CSS retains legacy variable names: public `--sage` now means warm stone and `--olive` means the dark action hover, rather than botanical identity. Sidecar tonal ramps are generated preview strips, not implemented palette steps.

**The Surface Scope Rule.** Keep buyer material tokens scoped to the public site and staff tokens scoped to the workspace and sign-in surfaces.

## Typography

**Display Font:** Marcellus (serif fallback), self-hosted regular (400).
**Body Font:** Manrope (sans-serif fallback), self-hosted (400/500/600/700).

Display type carries the buyer's spatial hierarchy; product names, price/stock facts and controls stay in Manrope. Display emphasis uses the same upright Marcellus face, with color rather than italics. Body paragraphs cap at 70ch. The frontmatter records desktop roles. Enquiry-form subheadings also use Marcellus regular at 27px.

At 1100px and below the hero title becomes 48px. At 700px and below it uses `clamp(34px, 8.4vw, 52px)` with a 1.16 line height; section headings become 38px, catalogue title 43px and product names 13px. Buyer panel headings remain 34px. Required sample-image disclosure stays at 9px and wraps away from the navigation icon. This is compact supporting metadata, not a size for controls or body copy.

Staff titles use the working sans-serif hierarchy; records use 13px, table headings 12px and stock/count values tabular numerals. Staff mobile task headings use 24px; editor titles use 23px and sign-in uses 30px.

The customer A4 PDF embeds Noto Sans and Noto Malayalam for English/Malayalam coverage. It uses the supplied mark, a 20pt LENORE heading, 10pt body, 11pt product rows and 14pt total. Warm charcoal, muted text and bronze enquiry identification adapt the buyer identity to white paper and fine warm rules. PDF typography deliberately differs from web display typography; font provenance and licences remain in `public/fonts/NOTO-LICENSE.txt`.

**The Working Type Rule.** Reserve Marcellus for buyer display hierarchy; keep staff tasks, controls and product facts in Manrope.

## Layout

Public layouts use generous breathing room, generally 4.5% desktop gutters and large section intervals. The site header is 104px high; it becomes 84px at the mobile breakpoint. Range content caps at 1560px and catalogue content at 1640px. The public system favors broad image fields and ruled information, rather than rounded card chrome.

The catalogue uses a 205px desktop filter rail with a 38px separation from a three-column grid. At 1100px the rail narrows to 170px and products use two columns. At 700px the rail becomes full-width search plus a horizontal category strip; products remain two columns with a 14px horizontal gap. Product image frames change from a 0.95 to a 0.85 aspect ratio. Buyer panels occupy up to 560px at the right edge, fill narrow screens and scroll internally; their inset changes from 35px to 26px vertically and 22px horizontally on mobile.

Staff layout uses a 225px sidebar (195px at 1150px), a 58px top bar, 24px working gutters and a four-cell summary. The overview uses a 1.6:1 grid with 20px gaps. At 850px the sidebar becomes horizontal navigation and the overview becomes one column. At 600px gutters become 16px, summaries use two columns and secondary filters stack. Record tables scroll inside their container.

## Elevation & Depth

Warm/cool tonal planes and thin rules provide most depth. Product and record cards have no resting shadow; staff sign-in also remains flat. A modal scrim preserves surrounding task context. Buyer panels retain the shared edge shadow (`-15px 0 50px #16251415`); staff editors use a cooler edge shadow (`-10px 0 35px #1c283412`). Shadows separate temporary overlays, rather than decorating ordinary records.

The hero photograph has one brightness/scale reveal (1.6s, `cubic-bezier(0.16, 1, 0.3, 1)`). Buttons transition background and border color (0.2s); product images retain a small hover scale. Reduced-motion rules remove animation and transitions.

## Shapes

Buyer buttons, inputs, category filters, product frames and major composition planes have square edges. Staff controls and badges use compact corners (3px), while main record surfaces are square. Staff sign-in retains a modest corner (4px); thumbnails use a smaller corner (2px). Circular enquiry counts remain a functional exception.

## Components

### Buttons and fields

Buyer primary buttons use charcoal fills and warm-white text, with a darker stone hover; secondary buttons use warm white with a fine border. Hero actions reverse to a pale stone fill. Buyer buttons have a 48px minimum height. Staff actions use the scoped ink and cool white, compact corners and a 40px minimum height. Disabled buttons reduce opacity and keep explicit disabled behavior.

Fields use a fine line, scoped white ground and a 44px minimum height. Public fields are square; staff fields use compact corners. Visible keyboard focus uses a 2px scoped accent outline with 4px offset. Field focus additionally retains the shared border/outline treatment from the base stylesheet; this is not a separate new material token.

### Navigation and filters

Public header navigation is quiet Manrope and hides at 700px; the enquiry action remains available. Catalogue category filters use a warm selected fill, a fine selected border and `aria-pressed`. Mobile categories scroll horizontally. Staff navigation sits on dark slate, with muted labels, a lighter hover and a light selected fill carrying dark text. Publication and stock filters keep explicit selected states.

### Product presentation and panels

Product cards are flat image-led units: code/category and availability, product title, then a ruled suggested-MRP/action row. Uploaded photo and specification poster media take precedence. Generated sample images are restricted to demonstration mode, four known demonstration SKUs and records without uploaded media. Their disclosure remains visible. Missing imagery keeps an explicit pending state.

Catalogue images can crop for composition. Detail images and specification posters show the complete object using contain fitting, including generated demonstration images. On mobile, reserve the image corner for the navigation icon and let the 9px disclosure wrap within its own width. Detail/enquiry panels inherit the buyer paper, display hierarchy and square controls; modal focus is contained, Escape closes and closing restores focus to the trigger.

### Staff records and status

Working surfaces use cool white, rules and compact headings. Tables separate headers, rows and actions with a consistent scanning hierarchy. Publication/stock badges carry words alongside color. Summary values and activity rows lead to tasks. Search/category/stock filters also determine filtered CSV export.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied Lenore mark and the separate buyer/staff palettes.
- **Do** use architectural display typography with precise Manrope product facts.
- **Do** keep required illustrative disclosures readable and separate from action icons.
- **Do** show the whole product or poster in detail views.
- **Do** qualify suggested MRP, unknown prices and stock honestly across web and PDF.
- **Do** keep keyboard focus, reduced motion and explicit error/empty states usable.

### Don't:

- **Don't** restore the rejected Cormorant/botanical public identity.
- **Don't** treat generated samples or inspiration scenes as real merchandise or approved product photography.
- **Don't** let public palette or display type spread into staff working records.
- **Don't** infer quality claims, contact details or connected stock from illustrative content.
- **Don't** use card shadows or rounded chrome to replace the established tonal planes and fine rules.
