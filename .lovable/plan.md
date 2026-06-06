## Configure Google Maps Extractor as the scraper source

Use Apify actor `compass/google-maps-extractor` as the default for the lead scraper. Its dataset returns Google Maps Place objects (not generic `name/phone/email` rows), so we need to update the field mapping defaults and tweak the pipeline to handle its shape.

### Actor output (relevant fields)
- `title` — business name
- `phone` / `phoneUnformatted` — phone number
- `website` — site URL
- `emails` — array of emails (only present if contact enrichment is enabled; usually empty)
- `categoryName` — business category
- `address`, `city`, `state` — location
- `url` — Google Maps URL

### Defaults to seed in `scraper_settings`
- `apify_actor_id` = `compass/google-maps-extractor`
- `field_map`:
  - `name` → `title`
  - `phone` → `phoneUnformatted` (falls back to `phone`)
  - `email` → `emails` (pipeline takes `[0]` if array)
  - `company` → `categoryName`
  - `source` → `url`
- `apify_input` (admin-editable JSON):
  ```json
  {
    "searchStringsArray": ["roofing contractor"],
    "locationQuery": "Austin, Texas, United States",
    "maxCrawledPlacesPerSearch": 200,
    "language": "en",
    "skipClosedPlaces": true
  }
  ```
- `batch_size` stays at 200; pipeline already passes `maxItems`, we'll also map it to `maxCrawledPlacesPerSearch` for this actor.

### Pipeline tweaks (`src/lib/scraper-pipeline.server.ts`)
1. When `field_map.email` value is an array (Google Maps `emails`), use the first element.
2. When `field_map.phone` resolves empty, fall back to the alternate (`phone` ↔ `phoneUnformatted`).
3. Pass `maxCrawledPlacesPerSearch: wantedBatch` in addition to `maxItems` so the actor respects the cap.
4. Strip non-digits from phone for dedupe consistency.

### Admin UI (`/admin/scraper`)
- Pre-fill the input JSON textarea and field-map inputs with the values above when settings row is empty.
- Add a short helper note under the actor field: "Default actor: `compass/google-maps-extractor`. Edit `searchStringsArray` and `locationQuery` to target your market. `emails` is usually empty unless you enable contact enrichment in the input."

### Migration
One small migration to update the existing singleton `scraper_settings` row with the new defaults (only if `apify_actor_id` is empty/null — don't clobber user edits).

### Out of scope
- Email enrichment (separate Apify actor / paid add-on).
- Per-setter custom search queries (still one global query for now).
