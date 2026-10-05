# Experimental Chronophoto Exposure

`Exposure` in Blend Mode averages the current frame and the ghost history with
normalized weights. Frame Depth, animated fractional depth, Stride, Cascade and
Mirror keep their existing roles. Clean Loop's null history slots are excluded
from the weight sum.

For opaque video frames the full-strength result is
`E = (current + sum(weight[i] * ghost[i])) / (1 + sum(weight[i]))`.
The existing opacity control becomes **Exposure Mix**, ranging from 0 (current
frame only) to 1 (the averaged exposure): `output = (1-Mix)*current + Mix*E`.
No new panel or extra slider is introduced. Turning Mix down preserves a sharper
current pose. The Chronophoto animation table also works with Exposure.

`src/js/chrono-compositing.mjs` converts these weights into running source-over
alphas shared by DOM preview, Canvas exports and the Frame Diff visual source.
This avoids pixel readback or a separate CPU accumulation buffer. CSS uses
`normal` while Canvas uses `source-over`. It also corrects that name mapping for
the existing Normal mode. Plus Lighter / Plus Darker are unchanged in this experiment.

This first version averages in the browser's usual compositing color space, not
linear-light radiance. It is an artistic exposure approximation, not a physical
camera simulation. Fully opaque footage is its reference case; partial source
alpha or reduced base-frame opacity follows ordinary source-over compositing,
not an independent premultiplied-alpha temporal average. More samples dilute
isolated moving details, and sparse sampling/large Stride still gives separate
poses rather than interpolated motion.

Validation includes numerical mean/mix tests and browser pixel checks: a gray
background stays at 128 for depths 1, 5, 20 and 100, and source values
200 / 20 / 80 / 100 average to 100. The browser suite also exports an Exposure MP4.

Run `npm test` for the pure calculation tests. Browser validation is documented
in [CHRONOPHOTO.md](CHRONOPHOTO.md).
