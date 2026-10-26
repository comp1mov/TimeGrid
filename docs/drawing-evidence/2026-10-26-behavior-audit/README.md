# Drawing behavior probe, 26 October 2026

Read-only audit of stable TimeGrid 28.34 and Drawing Lab 28.35.0-drawing.4. No app-source edit or deploy.

- [Probe](probe.cjs)
- [Raw results](results.json)
- [Full audit and proposed contract](../../DRAWING_BEHAVIOR_AUDIT_RU.md)
- [Stable Single capture](stable-single.png)
- [Lab Single capture](lab-single.png)

## Method

Edge 156.0.4314.42, Windows, 1440×1000, DPR 1. Stable source SHA-256 6636e424f18390523557d17c811d858e78b9b6d7ef5ef1d510ed939819caabfa.

Stable is served from the original checkout using Vite. Browser route interception appends test accessors inside the source closure, in memory only. The fixture creates 96 deterministic 160×90 images. Most scenarios use synthetic mouse or pen events and controlled state.currentTick calls through the existing updateAllCells function. Pen capture is bypassed only for synthetic pointer ID 91. These are not physical pen tests.

One scenario uses Playwright native mouse input with the existing startAnimation rAF clock at 8 fps. Lab uses native mouse input and its normal Play control. Both hold for about 760 ms. Stable painted frames 0…6; lab painted frame-0 and frame-5 only. Endpoint counts can vary with scheduler timing. Missing intermediate frames, not exact endpoints, are the regression.

20 records include 19 scenarios and one native setup record. Only three diagnostic assertions are pass/fail assertions in the probe: stable controlled hold has 6 frames, native stable hold >=4, lab misses intermediate frames. The remaining records are observations interpreted in the audit, not a green acceptance suite.

Native harness correction: the first attempt accidentally left the independent TPL window open after a TPL test, so native mouse went to that window. The corrected reset calls existing showTemplateFrame(false). The saved results are the corrected run. No product patch was made.

Pixel summaries count nonzero alpha, alpha sum, alpha-weighted centroid and an FNV-style checksum over RGBA. Checksums are not cryptographic hashes; original source SHA is cryptographic. Results include per-frame snapshots, temporal paths and before/after Undo/release values.

## Findings

- Regular stationary hold paints every changed displayed frame, including synthetic pen. Repeated same-frame update does not stamp again; a later revisit does.
- Native lab hold only records down/up frames.
- Mouse 1F clips; synthetic pen 1F leaks into the neighbor.
- Edge Undo leaves neighbor residue; FRM Clear Undo fails.
- Mouse Long Stroke accumulates. Trail=2 limits transferred history; release preserves drawings and does not start permanent decay. Bake changes some alpha.
- Pen Long Stroke does not accumulate the path in the tested PointerEvent adapter.
- 8→6 columns preserve per-frame data at unchanged tile size.
- Onion uses strict adjacent frames with no wrap.
- TPL bake targets all 96 frames and Undo restores TPL.
- Hidden TPL is still included by drawing export helper.
- Loading a saved empty TPL does not clear a subsequently painted TPL.
- BG is paintable between cells, and Grid/Single backgrounds are separate.
- No pageerror in corrected run.

## Reproduce

PowerShell, from the drawing checkout:

    $env:PLAYWRIGHT_MODULE='C:/Users/gregt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
    $env:STABLE_ROOT='D:/Antigravity/TimeGrid'
    $env:LAB_URL='http://127.0.0.1:5197/drawing-lab.html'
    node docs/drawing-evidence/2026-10-26-behavior-audit/probe.cjs

Lab server must already serve the unchanged .4. Probe starts/stops its own stable Vite on 5199; TEST_PORT can override. Output overwrites this directory's results/captures. Tests do not modify the stable source. File fixtures and time are deterministic except native scheduling and raster edge rounding.

Not covered here: physical phone/tablet/stylus, Safari, real pressure, multitouch, real decoding, full video exports, reorder/new sampling, or performance timing. Previous live-input measurements remain in ../2026-10-26-live-input-review; do not attribute those numbers to this probe.

## Delivery checks

Probe diagnostic assertions passed; pageerror list is empty. Probe syntax check, Git whitespace check, independent lab version check and build:lab passed. Stable source SHA remained unchanged. Build was verification only; no artifact was published.
