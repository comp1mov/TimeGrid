# Drawing Lab 28.35.0-drawing.7 verification

27 October2026, codex/drawing-engine. UI-only iteration on the same lab. Stable28.34, ordinary Drawing.2 and Cloud unchanged.

## Scope and evidence

- build:lab and independent release checks pass. npm test:50 passing.
- production/drawing-temporal:28 checks. Native stationary mouse, synthetic mouse/touch/pen, Long/Trail/1F, bake/undo, reflow,4096 export and actual file roundtrip.
- production/drawing-extended:13 checks. Brushes on all targets, erase/cache/save, onion, images, wheel and touch pinch.
- production/drawing-lab-quality:9 checks. SVG reference, measured widths, stabilization, all96frames and emulated phone.
- production/drawing-workspace:11 checks. Shortcuts, external BG/export, density, compact mobile layout and old.5BG raster.
- production/drawing-panel:11 checks. Direct controls, saved stroke styles, actual download/Clear/Undo/Redo/Open, contextual controls and three viewport touch flows.
- Screenshots in production/drawing-panel were visually inspected. Browser menu uses existing TimeGrid colors/font; no production app restyle.
- live/results.json:240rAF samples per brush at1440×1000 on Edge. Render p95:Round3.7ms,softRound1.0ms,Spray1.4ms,softSpray1.6ms. New larger canvas, not a strict A/B.
- Preview screenshots in preview/ document development inspection; production/ contains final checks. Public verification:22 checks passed (public/drawing-panel and public/drawing-workspace). Source eba3178, Pages18b108a. deployment.json records matching build/public SHA256, license200 responses, missing ordinary index404 and unchanged .6 hash.

## Limits

No physical phone/Pencil/Wacom test performed by agent. Browser viewport emulation does not measure hardware latency. No fill, full-media project, or integration into ordinary TimeGrid. Three quick colors and parameter selection are session UI preferences; stored strokes keep their colors. Clear FRM clears all96frame drawings and can be undone. Save is drawing geometry/settings, not video assets.

The existing drawing kernel, gesture, time, and cache modules are unchanged. Test adaptations open the new menu when accessing advanced controls; pixel/geometry assertions remain. The .6 layout assertion is replaced by the compact palette-below-canvas contract.
