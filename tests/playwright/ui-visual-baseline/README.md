# UI visual + layout regression baseline

Committed baseline for `tests/playwright/ui-visual-regression.js` (audit finding **F-8**).

## What is in here

`<page>.<viewport>.<state>.layout.json` — the **diffable regression contract**: for
each captured state, the resolved `:root` design tokens, plus computed style +
client rect for a fixed set of chrome selectors, plus a horizontal-overflow flag.
Deterministic and host-independent. This is what a CSS refactor changes, and this
is what the check asserts.

PNG artefacts (`<tag>.chrome.png` non-canvas UI clip, `<tag>.full.png` full frame)
are written under `tests/playwright/screenshots/ui-visual/` and are **gitignored**
— they are host-dependent (GPU rasterisation) and large. The chrome clip is
pixel-diffed with a soft per-channel tolerance; the full frame is a human-review
artefact only.

## Capture matrix

| | |
|---|---|
| Browser | Chromium (bundled Playwright), headless, `deviceScaleFactor: 1` |
| Viewports | 1366×768, 1920×1080, 2560×1440, 3840×2160 |
| EAP states | `production` (sim OFF, REAL/UNAVAILABLE), `demo` (sim ON — deterministic per `cell_id`, no clock), `selected` (first drawn cell picked), `drawer` (first zone drawer open), `webgl-lost` (forced context loss) |
| Twin states | `default`, `drawer` (via `#drawer-toggle`, waited past the 140ms grid transition), `webgl-lost` |

## Expected dynamic regions (excluded from the JSON contract)

- Every `<canvas>` — never in the chrome clip; WebGL raster is not asserted.
- Twin `#status-strip`, `.ss-cell`, `#factory-status`, `.fs-cell` — **rect dropped**
  (`"rect": "live-data"`); their size tracks live telemetry digit counts and
  populated device rows. Their computed *style* is still asserted.
- `body` / `#stage` rect — viewport-derived, dropped.

## Usage

```
# against a factory-twin-3d container serving the working-tree public/ on :4199
EAP_URL=http://127.0.0.1:4199/ TWIN_DIRECT_URL=http://127.0.0.1:4199/ \
  node tests/playwright/ui-visual-regression.js            # compare, exit 1 on drift
EAP_URL=... TWIN_DIRECT_URL=... \
  node tests/playwright/ui-visual-regression.js --update    # rewrite this baseline

# with neither URL set: SKIP, exit 0 (matches the other EAP browser regressions)
```

Update the baseline **only** for an intentional visual change, and say so in the
commit that does it.
