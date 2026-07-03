# TimeGrid Backlog

Updated: 2026-07-04

This file is the inbox for new ideas before they become implementation work.

Use this flow:

1. Capture the raw idea here as a short feature card.
2. Add the expected user behavior, affected UI, preview/export rules, and checks.
3. When implementation starts, keep the card in `In Progress`.
4. When shipped, move the decision/history summary to `docs/DEVELOPMENT_HISTORY.md`.

## Done

### Custom frame selection and slice layout defaults

Status: shipped in `TimeGrid v28.19`

User need:

- In `Frame Selection`, add a mode for manually choosing exact video frame numbers.
- When entering this mode, prefill the list from the current selected/generated frames, preserving the current amount of frames.
- The custom list should respect the same Start Frame / End Frame bounds as other selection modes.
- Check image `Slice` behavior across modes.
- When slicing an image, the preview grid should default to the same number of columns as the source slice settings, so the sliced preview preserves the original image layout instead of auto-fitting into a different column count.

Implementation notes:

- Add `Custom Frames` to `selectionMode`.
- Store the raw list in `state.customFrameList`.
- Treat UI frame numbers as 1-based; convert to 0-based only inside capture logic.
- Parse comma, space, and newline separated values.
- Use the normal video capture pipeline so preview/export continue to share the same generated `state.frames`.
- In slice mode, set `gridCols` to `cutCols` after slicing by default.

Verification:

- Switch from `Fixed Count` to `Custom Frames`; the textarea should be filled with the current frame numbers.
- Edit the list, click `Regenerate Grid`, and confirm the grid uses exactly those video frames.
- Change Start/End bounds and confirm custom frames are clamped to that range.
- Slice a single image with `Cols = 3`, `Rows = 3`; preview should show 3 columns.
- Repeat with another column count and confirm the preview columns follow `Cols`.

## Inbox

- Image slice / poster / sprite sheet workflow as a full documented scenario.
- Project save/restore through ZIP or embedded metadata.
- Mobile simple mode: import, grid controls, preview/export.
- Plot/Manovich-style sorting and AI-assisted analysis.
