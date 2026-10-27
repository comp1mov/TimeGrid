# Drawing Lab 28.35.0-drawing.8 evidence

27 October2026. Isolated codex/drawing-engine branch. Main/Cloud and ordinary drawing.2 are not released by this update.

- 50unit tests: npm test.
- 90browser checks: production/drawing-temporal28, drawing-extended13, drawing-lab-quality9, drawing-workspace11, drawing-panel11, drawing-fill18. Final code adds cancellation on a new gesture and accessible select key navigation; final fill/panel suites rerun after these guards. Earlier suites ran the same render/storage code.
- Real UI Fill selection, mouse click, Save download and file Open; exact 2K/4K raster roundtrip, Undo/Redo, slots, grid reflow, holes, erase gap, active layer, outside BG, weak/sparse edge behavior, malformed payload refusal and cancellation.
- Template bake comparison is not bit exact due to its existing intermediate canvas: mean RGBA channel difference0.000227,409changed channels. Baked Save/Open is exact. Initial stricter assertion exposed this, was investigated visually and numerically, then replaced with an explicit bounded comparison; no renderer workaround was introduced.
- Desktop Edge and mobile emulation320/390px, landscape844×390. Physical phone, Pencil, Wacom and desktop touchscreen are not tested by the agent. Screenshots reviewed.
- live/results.json:240rAF samples,96frames,size80. Render p95 Round2.7ms,softRound1.1ms,Spray1.6ms,softSpray2.5ms. Canvas layout differs from .7 due to required slots; not a controlled A/B performance comparison.

Fill uses a temporary bounded alpha mask in document coordinates; immutable horizontal runs remain as data.0.5logicalpx for frames/TPL,1px BG. Maximum4MiPixels, RGBA+visited+queue36MiB, canvas backing up to16MiB additionally. Source rasterization/getImageData still synchronous; yielding loops are not a guarantee of a maximum UI stall. Exterior BG search window2048×2048; large/open boundaries are rejected, never partially filled. Very fine gaps/very faint ink have sampling limits. Previous fill areas are not recolored by clicking their interior.

Schema6 reads schemas1–5, stores fill-runs-v1 and validates imported bounds/runs before replacement. Main program version and original stable source hash are verified separately at release. Public deployment is verified in deployment.json: source4b435f2, Pages611bb56, matching local/public SHA25660702d171092ef58f071130bad63d766695c5476eae1b330f020da54c33d6585. Licenses200, ordinary index404, previous .7 unchanged. All29public browser checks passed (18fill+11panel).
