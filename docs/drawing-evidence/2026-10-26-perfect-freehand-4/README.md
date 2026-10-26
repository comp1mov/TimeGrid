# Drawing Lab 28.35.0-drawing.4: evidence

26 October 2026. Separate lab build, ordinary application remains drawing.2 and stable production 28.34.

## Reproduction

Build: `npm run build:lab`. Serve `.drawing-lab-build`. Set TEST_URL to served drawing-lab.html and DRAWING_OUTPUT to a new evidence directory, then run:
- `npm test` (38 unit tests).
- `node tests/drawing-lab.browser.cjs` (9 document/cache checks and Round benchmark).
- `node tests/drawing-lab-extra.browser.cjs` (7 input/layer/export checks).
- `node tests/drawing-lab-quality.browser.cjs` (9 independent curve/width/legacy/fractional seam checks).
- `node tests/drawing-lab-brushes.browser.cjs` (9 brush checks including a fresh-page Save/Open, pixel reference, timed input, particle budget recovery and touch emulation).

PLAYWRIGHT_MODULE points to the installed Playwright runtime. Standard headless Edge 156.0.4314.42 on Windows, Radeon 890M. Not IAB, not a physical phone/pen, not the author's RTX 5090. Browser graphics versions and GPU are recorded in production/benchmark.json. Timings are JS submission / CPU durations, not pen-to-photon or total GPU completion.

## Scope and evidence files

`production/` holds the final standalone artifact run: checks.json, extra-checks.json, quality-checks.json, brush-checks.json, benchmark.json, downloaded drawings/PNG and screenshots. `dev/` is the earlier development run, not the final public build. Historical .3 measurements remain untouched.

Canvas reference paints saved circles/gradients independently of tile indexing. Comparison uses alpha (mean <0.3 per canvas pixel, no lost opaque interior); Open and cache rebuild are byte-exact in that environment. The mixed-brush fixture additionally saves through the real Download action, opens through file input in a fresh page, and compares JSON + exported PNG byte-exact. Existing document checks allow RGB rounding tolerance 2; reference SVG contour edge differences retain the established .3 tolerances.

Synthetic CDP input timestamps demonstrate fast-thick and pen priority. An excessive Spray gesture tests rAF limit handling, atomic cancellation and subsequent recovery. Mobile emulation 390 × 844, DPR 3, soft Spray 29 250 particles crosses 20 cells; Single/Undo/Redo preserve JSON and layout has no horizontal overflow. No physical-device result is claimed.

## Measurements, final local production run

| Workload | Geometry | JSON bytes | Cold redraw ms | Warm ms | Open ms |
| --- | --- | --- | --- | --- | --- |
| Hard Round, 96 frames / 1000 strokes | stored contours | 4 590 777 | 41.9 | p95 0.3 | 24.1 |
| Spray, 96 / 96 | 595 968 particles | 15 929 695 | 667.4 | max 1.4 | 170.2 |
| Soft Round, 96 / 96 | 12 768 dabs | 333 982 | 64.6 | max 0.2 | 3.1 |

Hard Round cache 14 776 320 bytes, Undo 0.7 ms. Empty document cache 0. Sparse raster budget 24 MiB; this excludes geometry arrays, indexes and browser overhead. Spray and Round workloads have different geometry and cannot be compared as equivalent-speed workloads.

The first development stress exceeded the conservative 32 MiB storage estimate. Fixed precision (0.0001 logical px per stamp value) removed irrelevant float tails without raising the budget. No data files are silently quantized on Open: schema 3 stamp precision is validated; older schema 1/2 contours keep their original values.

## Remaining limits and artistic review

Cold Spray is slow; cached redraw is not evidence that first draw/export/live long strokes are fast. Active draft geometry still regenerates the whole segment. Save/Open is synchronous. Particle count limit is 120 000 per segment; excessive gestures are cancelled, not silently truncated. Raster memory is bounded but total JS heap was not measured.

The author accepted .3's basic line and stabilization; .4's Spray, softness and speed feel still need their review. Screenshots brushes-single.png, speed-pressure.png and spray-phone-emulation.png are visual fixtures, not hardware acceptance.

Fill, layout reflow/stable IDs, 1F, Long Stroke/Trail, Onion Skin, video proxy/original export and legacy raster migration are not implemented by this release. Planned fill means a closed drawn shape, not image/video colour segmentation.

Public publication: gh-pages commit 8d06223, HTTP 200 for lab HTML and both license files, normalized LF SHA-256 52b807d0f34c9aea4eee0ab0447a6ecb91bbcb0d0e394e1a89d562ef79abd301 matches the local artifact. Ordinary index.html in the new folder returns 404. See publication.json. Public quality and brush suites each passed 9 checks, stored in public/. The public phone screenshot explicitly selects a touched frame; the earlier production screenshot retained default frame 1, which the diagonal fixture does not touch.

After the Pages push, Vercel still reports production deployment dpl_ELJbbadbc6uSxe8RiREjigzB3ZZ8 on main 3dfd4f0390a1bacdcfdb039c4eef0066a8900e05. No new preview appeared. Branch deploymentEnabled settings remain unchanged.
