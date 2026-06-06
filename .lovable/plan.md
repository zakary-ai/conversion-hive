## Replace raw JSON textarea with a structured input form

On `/admin/scraper`, swap the "Apify input JSON" textarea for a clean form that maps 1:1 to the Google Maps Extractor input schema. Internally we still serialize back to the same `apify_input` JSON shape — only the UI changes.

### Fields shown (in this order)
Grouped into a card with subtle section dividers:

**Search**
- `searchStringsArray` — repeating text input list with "Add search term" / remove buttons (one search term per row, e.g. "apartment complex").
- `locationQuery` — single-line text input (e.g. "Tallahassee, USA").
- `language` — short text input (default `en`), 80px wide.
- `maxCrawledPlacesPerSearch` — number input (1–1000, default 50).

**Scrape options** (2-column grid of labeled switches)
- `scrapePlaceDetailPage`
- `scrapeContacts`
- `scrapeDirectories`
- `scrapeOrderOnline`
- `scrapeTableReservationProvider`
- `includeWebResults`
- `skipClosedPlaces`
- `verifyLeadsEnrichmentEmails`

Each switch has a short helper line under its label so it's clear what it does.

### Save behavior
On "Save settings", assemble the object from the form state and send it as `apify_input` (same field as today). Any keys the form doesn't know about that exist on the saved object are preserved (merge over original) so power users don't lose custom fields.

### Out of scope
- No raw JSON view/toggle.
- Field map and the rest of the page stay as-is.
- No backend / pipeline changes.

### Files
- `src/routes/_authenticated/admin/scraper.tsx` — replace `inputJson` state + textarea with typed form state and inputs.
