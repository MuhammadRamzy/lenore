# 0011 · Public website: brand-led hero, cart, Visit us, legal pages

Date: 2026-10-22 · Status: accepted

**Context.** The owner rejected an operational hero (quotation copy, three hand-picked products) and a dark product wall: the landing page is the brand's identity, and the imagery should represent the whole range. Visit us repeated the footer. Product photos and posters were created or enhanced with AI from photos of the real products.

**Decision.**

- Hero on warm Stone with the brand line "Your bathroom, considered." (brand book sample copy) and tagline; one product at a time in a large spotlight (cross-fade every 5 s, only current/next images fetched), then a single drifting filmstrip. Both draw 24 random photographed products per request, so the whole range appears over visits.
- Navigation: centred links, Collections panel (all collections with counts) on desktop, full-screen menu on phones; "Sales catalogue" only in the footer.
- Website cart (browser storage) sends itemised quote or order requests on WhatsApp and records them in Enquiries.
- Visit us: Google Maps embed at the owner's coordinates (CSP `frame-src https://www.google.com` only), directions to the coordinates, `geo` in LocalBusiness data.
- `/privacy` and `/terms`. The AI-imagery disclosure appears **only** in the Terms (owner's instruction), not on product pages.

**Consequences.** Opening hours are still unknown and not shown. Legal text is a plain-language starting point; the owner should have it reviewed. DESIGN.md still describes an older visual system and needs refreshing.
