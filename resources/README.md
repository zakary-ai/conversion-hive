# App icons & splash screens

These source images are used by `@capacitor/assets` to generate every icon
and splash variant required by iOS and Android.

- `icon.png` — 1024×1024 app icon (no transparency, no rounded corners).
- `splash.png` — 2732×2732 (or larger) splash screen, logo centered.
- `splash-dark.png` — dark-mode splash variant.

Regenerate platform assets after editing:

```bash
bun run assets:generate
```
