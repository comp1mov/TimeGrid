# TimeGrid development rules

## Separate development lines

- `D:/Antigravity/TimeGrid`, branch `main`, is the stable local application. Its current released code is TimeGrid 28.34.
- Cloud work belongs to the attached worktree `C:/Users/gregt/.codex/worktrees/timegrid-cloud/TimeGrid`, branch `codex/timegrid-cloud`. Never edit the stable checkout to implement or test Cloud features.
- Keep Cloud dependencies, environment files, backend, build output and release history in that worktree. Do not copy the stable `.vercel` link or deploy Cloud to the existing production project.
- Drawing-engine changes belong to `C:/Users/gregt/.codex/worktrees/timegrid-drawing/TimeGrid`, branch `codex/drawing-engine`, based on stable 28.34. Its first iteration is `28.35.0-drawing.1`. Do not require or mix in the Cloud branch to work on drawing.
- Port an improvement between lines only deliberately, with an entry in the receiving line's development history and relevant verification. Do not merge the Cloud experiment wholesale into `main`.

## Version and history are required

- Every delivered functional iteration, including fixes and performance changes, must have a new app version and an entry in `docs/DEVELOPMENT_HISTORY.md`. No unversioned follow-up releases.
- Update `package.json`, both root versions in `package-lock.json`, the visible HTML labels, `APP_VERSION` and the current-version line in README together. Cloud also updates the JS/Python renderer compatibility identifiers together.
- Use an explicit prerelease suffix for experiments, such as `28.35.0-cloud.1` or `28.35.0-drawing.1`; label the Cloud application visibly as TimeGrid Cloud.
- Record the date, branch, changes, verification results and remaining limitations. Do not rewrite old benchmark results as measurements of a new version.
- Documentation-only work gets a dated history entry and a plan revision where applicable; it must not pretend the unchanged stable application is a new release.
- Before delivery, check version consistency, build the affected line, and run checks appropriate to the change. Report physical-device tests separately from emulation.

## Independent Drawing Lab releases

- Author clarification, 2026-10-26: lab-only changes must not release or renumber the ordinary application. Drawing Lab uses `drawing-lab.release.json`, its own HTML/APP_VERSION, README current-lab line and dated development-history entry. Root package/lock and ordinary HTML/APP_VERSION remain at the last ordinary-app release. Run `npm run build:lab`; publish only that artifact and licenses. Do not add an ordinary-app copy to a new lab URL.
- Explain proposed changes before implementation. At delivery give one current test link, concrete checks, and the next step. Physical phone testing must be distinguished from emulation.

## Planning and audit evidence

- Use `docs/DEVELOPMENT_PLAN_RU.md` as the current cross-line plan. Read the relevant audit sections and the latest development-history entry before implementation.
- The September audit concerns 28.33. Check whether 28.34 already fixed an issue before treating it as current.
- Preserve BG/TPL/FRM semantics, brush character, existing drawings and preview/export agreement. Drawing input/storage is an explicit architectural priority, not UI polish.
- Desktop mouse measurements are not phone or pen measurements. Keep raw evidence and state test limitations.
- Keep credentials out of source, logs and chat. Modal Volumes are excluded from the current design; R2 activation is still a separate unresolved billing decision.
