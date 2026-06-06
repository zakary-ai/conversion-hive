## Daily city rotation for the scraper

Make the scraper cycle through a list of ~200 cities — each daily run uses the next city as `locationQuery`, wrapping back to the start after the last one.

### Schema (migration)
Add two columns to `scraper_settings`:
- `city_rotation text[] not null default '{}'` — ordered list of locations (e.g. `"Austin, TX, USA"`).
- `city_rotation_index int not null default 0` — pointer to the next city to use.

Seed the existing settings row with a default list of ~200 US cities (largest metros, "City, ST, USA" format).

### Pipeline change (`src/lib/scraper-pipeline.server.ts`)
Right before the Apify call:
1. If `city_rotation` is non-empty, pick `city_rotation[index % length]` and override `apify_input.locationQuery` with it.
2. After a successful run (success or partial), advance `city_rotation_index` by 1 (modulo length) via `supabaseAdmin.update`.
3. Record the city used in `scraper_runs.details.city`.

If the list is empty, fall back to the existing `locationQuery` from the input form (current behavior).

### Admin UI (`/admin/scraper`)
In the Search section:
- Replace the single "Location" input with a **City rotation** card showing:
  - Header line: "Cycles one city per daily run. Next up: **{cities[index]}**" plus a small "Skip to next" button.
  - Textarea (one city per line) bound to `city_rotation`.
  - Counter: "{n} cities · resets after the last".
- Keep the per-input "Location" hidden when rotation has entries; only used as fallback.

Saving the textarea splits on newlines, trims, drops blanks, and resets `city_rotation_index` to 0 only if the list shape changes meaningfully (length differs) — otherwise preserve the index.

### Server fns (`scraper.functions.ts`)
- Extend `updateScraperSettings` to accept `city_rotation` and `city_rotation_index`.
- Add `skipNextCity()` admin fn that advances the index by 1.

### Out of scope
- Per-setter city lists.
- Per-search-term city rotation (still one global cycle).
- Timezone-aware "day" calculation — we rely on the daily 8am EST cron firing once per day.
