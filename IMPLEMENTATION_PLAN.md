# BiliFrame implementation plan

## Stage 1: Baseline and design
**Goal**: Establish a dedicated Git repository, inspect the current Bilibili desktop player, and record a concrete compatibility design.

**Success Criteria**:
- The repository lives only in `F:\git\better_bilibili\biliframe` on branch `main`.
- Repository-local Git identity uses the connected GitHub name and Gmail address.
- Current player DOM, insertion anchors, fallbacks, supported pages, and exclusions are documented.
- `.gitignore` excludes dependencies, test output, temporary files, and local editor metadata.

**Tests**:
- `git status --short --branch`
- `git config --local --get user.name`
- `git config --local --get user.email`

**Status**: Complete

## Stage 2: Core behavior with tests first
**Goal**: Define and test deterministic helpers for cover URLs, filenames, frame-rate samples, seek targets, editable-target filtering, and timestamp links before browser integration.

**Success Criteria**:
- Tests cover Bilibili image-processing suffix removal without corrupting ordinary URLs.
- Tests cover frame-rate parsing, robust frame-duration estimation, and seek clamping at both media boundaries.
- Tests cover safe filenames, timestamp formatting, and keyboard-shortcut guards.
- The distributable userscript can also expose its pure core API to Node tests without executing browser startup.

**Tests**:
- `npm test` is red before implementation and green after implementation.
- `npm run check` parses the userscript successfully.

**Status**: Not Started

## Stage 3: Player integration
**Goal**: Add native-looking controls, cover preview/download, forward/backward frame stepping, current-frame capture, and exact-time link copying.

**Success Criteria**:
- Four accessible 36px controls are inserted after the native play button in the lower player bar.
- Frame actions pause the active video, use measured `requestVideoFrameCallback` timing when available, fall back safely, clamp seeks, and report the result.
- Cover preview shows the unprocessed original image and provides explicit open, copy, and download actions.
- Current-frame capture produces a timestamped PNG while keeping failures visible to the user.
- SPA navigation, player rebuilds, theater/fullscreen modes, multiple video elements, and duplicate mounting are handled.
- Keyboard shortcuts work only outside editable controls and do not hijack modified browser/system shortcuts.

**Tests**:
- Node integration tests exercise mounting and interaction against the project DOM fixture.
- Live Bilibili structural checks confirm the current selectors and dimensions used by the adapter.

**Status**: Not Started

## Stage 4: Compatibility QA and documentation
**Goal**: Validate the complete userscript and document installation, usage, limitations, privacy, and release readiness.

**Success Criteria**:
- Unit/integration tests and syntax checks pass.
- The live desktop video page still exposes the selected player, video, control-bar, and cover anchors.
- README contains Tampermonkey installation and every button/shortcut.
- No network requests are added beyond user-triggered cover download/open behavior.
- The final Git tree is clean after a meaningful commit.

**Tests**:
- `npm test`
- `npm run check`
- `npm run verify`
- `git diff --check`
- Manual/live acceptance checklist in `docs/VALIDATION.md`

**Status**: Not Started

