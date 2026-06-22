# B2C Bookings page fixes

## 1. Fix the "Something went wrong" crash on the Calendar tab

The error in console is `Maximum update depth exceeded`. Cause: in `src/components/admin/b2c-calendar-panel.tsx`, two `useQuery` calls use a default of `= []` directly in the destructure:

```ts
const { data: existing = [] } = useQuery({...});
useEffect(() => { /* setByDay(...) */ }, [existing]);
```

When the query is loading/`undefined`, that fallback creates a **new `[]` reference on every render**, the `useEffect` re-runs, calls `setByDay`, which triggers another render → infinite loop → React crashes → root `ErrorComponent` shows "Something went wrong".

Fix: drop the destructure default and guard the effect.

```ts
const { data: existing } = useQuery({ queryKey: ["b2c-availability"], queryFn: listB2cAvailability });
useEffect(() => {
  if (!existing) return;
  // build byDay from existing
}, [existing]);
```

## 2. Reorder tabs on `/app/admin/bookings`

In `src/routes/app/_authenticated/admin/bookings.tsx`:

- Change `<Tabs defaultValue="bookings">` → `defaultValue="calendar"`
- Reorder `TabsList` and `TabsContent` to: **Calendar → Bookings → Applications**

## 3. /apply slots driven only by weekly availability

Today, `listCloserSlotsForDate` requires **both** an admin weekly window **and** at least one closer with availability covering that minute. This means leaving closer availability empty hides every slot on /apply.

Rewrite the public slot logic so it depends only on the admin weekly windows + booking settings (`slot_minutes`, `days_out`):

- For the requested date, look up the EST day-of-week's admin windows in `b2c_availability_rules`.
- If the day has no admin window → no slots.
- Otherwise enumerate slots every `slot_minutes` inside each window.
- Filter out slots in the past and beyond the `days_out` horizon.
- Subtract slots already taken (`closer_bookings` rows in `pending_assignment` or `assigned` at that ISO time) — cap one lead per time slot to avoid double-booking; closer assignment still happens later in the admin Bookings tab.
- Closer availability is no longer consulted for the public calendar.

This keeps the existing `/apply` UI and `createCloserBooking` flow unchanged — only the slot-generation source changes.

## 4. Auto-refresh /apply when admin saves availability

Two layers:

- **Admin panel** (`b2c-calendar-panel.tsx`): the `saveAvailability` mutation already invalidates `["b2c-availability"]`. Also invalidate `["closer-slots"]` and `["bookings-for-date"]` so the in-page date view refreshes immediately.
- **Public `/apply`**: set the slots query with `staleTime: 0` and `refetchOnMount: "always"` so a lead opening the page (or revisiting after the form step) always sees the latest windows. Real-time push to other users' browsers isn't needed for "every time save is clicked" — the lead's own page will pick up changes on load/refresh.

## Files touched

- `src/components/admin/b2c-calendar-panel.tsx` — fix infinite loop (`existing` + matching pattern for `byDay`/`existing` dependency); add extra invalidations on save.
- `src/routes/app/_authenticated/admin/bookings.tsx` — reorder tabs, default = calendar.
- `src/lib/api/b2c.functions.ts` — rewrite the slot-generation block in `listCloserSlotsForDate` to ignore `closer_availability_rules` and use admin windows only, with one-lead-per-slot capacity.
- `src/routes/apply.tsx` — set `staleTime: 0` / `refetchOnMount: "always"` on the slots query.

No DB schema changes.
