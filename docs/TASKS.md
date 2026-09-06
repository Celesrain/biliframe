# BiliFrame delegated task board

All implementation, test, documentation, validation, and Git completion work after this board was created is delegated to **gpt-5.6-luna with medium reasoning**. The root agent only plans, sequences, and reviews reported evidence.

## Coordination rules

- Work in `F:\git\better_bilibili\biliframe` only.
- Read `AGENTS.md` instructions already present in the task context plus `IMPLEMENTATION_PLAN.md` and `docs/DESIGN.md` before editing.
- Preserve user-authored and sibling-agent changes.
- Do not create a GitHub repository, remote, release, tag, or push.
- Do not install browser extensions or dependencies.
- Use Node's built-in test runner; the distributable userscript must stay dependency-free.
- One agent owns `src/biliframe.user.js` at a time. Test/docs-only work may run concurrently.
- Do not commit from parallel tasks. Only T13 performs the final commits after all checks pass.
- Each task must report files changed, commands run, results, and any remaining uncertainty.

## T01 — Core contract review

**Owner**: Luna Core

**Files**: `src/biliframe.user.js`, `tests/core.test.cjs`, `package.json`

**Steps**:

1. Review the existing 13 pure-function tests and their implementation for Windows filenames, URL processing, fractional FPS, seek clamping, timestamp formatting, and shortcut filtering.
2. Add only missing edge-case tests that expose a real defect.
3. Fix the smallest amount of core code needed.
4. Run `npm test` and `npm run check`.

**Done when**: all core tests pass, syntax check passes, and no browser bootstrap code is added by this task.

## T02 — Minimal DOM fixture and red UI contract

**Owner**: Luna Tests

**Files**: `tests/support/fake-dom.cjs`, `tests/ui.test.cjs`

**Steps**:

1. Build only the fake DOM features required by BiliFrame (`createElement`, attributes, children, insertion, lookup, and event dispatch).
2. Write tests for adapter selection with modern semantic anchors and one legacy fallback.
3. Write tests for choosing the visible/ready/largest video inside the player.
4. Write tests for four accessible controls in the required order.
5. Write tests for click and Enter/Space activation, propagation control, and idempotent mounting.
6. Run the UI test once and preserve the expected red result caused by missing UI exports.

**Done when**: failures describe missing behavior rather than fake-DOM bugs; no source file is edited.

## T03 — Selector adapter and active-video selection

**Owner**: Luna Player (sequential after T01 and T02)

**Files**: `src/biliframe.user.js`

**Steps**:

1. Add ordered modern and legacy control-group/play-button selectors.
2. Return no adapter unless a valid control group and play anchor belong to a recognized player.
3. Score candidate videos by player containment, connection, visibility, readiness, and rendered area.
4. Export these helpers for Node tests without starting the browser runtime.
5. Run the focused UI tests for selectors/video choice plus all core tests.

**Done when**: T02 selector and video-choice cases are green; no controls are mounted yet.

## T04 — Native control construction and idempotent mount

**Owner**: Luna Player

**Files**: `src/biliframe.user.js`

**Steps**:

1. Create previous-frame, next-frame, current-frame capture, and cover buttons.
2. Reuse `bpx-player-ctrl-btn`; namespace every custom class/data attribute.
3. Add `role`, `tabindex`, `aria-label`, and shortcut-aware title text.
4. Activate on click, Enter, and Space; stop propagation only for custom controls.
5. Insert immediately after the native play button and prevent duplicate mounts.
6. Run the focused control/mount tests and the full test suite.

**Done when**: all T02 control tests are green with injected action spies.

## T05 — Frame clock and stepping action

**Owner**: Luna Player

**Files**: `src/biliframe.user.js`, focused additions to `tests/ui.test.cjs` only if needed

**Steps**:

1. Observe `requestVideoFrameCallback` metadata without changing playback.
2. Keep a bounded sample buffer and reject discontinuities using the documented limits.
3. Rebind safely when the chosen video changes.
4. On step: pause, calculate one-frame target, set `currentTime`, and expose effective FPS/time to status.
5. Fall back to 30fps when RVFC is unavailable or unsampled.
6. Test pause-before-seek, both directions, clamping, fallback, and observer rebinding.

**Done when**: deterministic tests cover the action and all suites pass.

## T06 — Cover resolution and modal

**Owner**: Luna Media (sequential source ownership after T05)

**Files**: `src/biliframe.user.js`, `tests/ui.test.cjs`

**Steps**:

1. Resolve cover candidates in the exact order documented in `docs/DESIGN.md`.
2. Normalize only Bilibili image-processing suffixes and reject unusable URLs.
3. Build a body-level, namespaced modal with original image, filename, Download original, Open original, Copy URL, and Close.
4. Close on button, backdrop click, and Escape; trap no global focus and restore the opener's focus.
5. Make repeated openings replace/update one modal instead of duplicating it.
6. Add focused tests for candidate priority and modal lifecycle.

**Done when**: modal and cover tests pass without page-global or private-API access.

## T07 — User-triggered media actions

**Owner**: Luna Media

**Files**: `src/biliframe.user.js`, `tests/ui.test.cjs`

**Steps**:

1. Wrap `GM_download`, `GM_openInTab`, and `GM_setClipboard` behind injectable adapters.
2. Generate safe cover filenames from title plus BV/episode identity and original extension.
3. Capture the current video frame at intrinsic dimensions to PNG with timestamped filename.
4. Add an exact-time URL copy action in the modal or status UI without a fifth permanent control.
5. Surface missing cover, unready video, tainted canvas, and userscript-manager failures through status.
6. Test success/fallback/error paths with spies; never trigger a real download/open/copy in tests.

**Done when**: actions occur only after explicit BiliFrame clicks and every failure is visible.

## T08 — Browser lifecycle and SPA resilience

**Owner**: Luna Integration (sequential source ownership after T07)

**Files**: `src/biliframe.user.js`, `tests/ui.test.cjs`

**Steps**:

1. Bootstrap safely at `document-start` and wait for `documentElement`/body/player as required.
2. Debounce mutation-triggered remounts.
3. Handle `popstate`, `hashchange`, `history.pushState`, and `history.replaceState` without double-patching.
4. Rebind controls and frame observation after player replacement or part navigation.
5. Add global `Alt+,` / `Alt+.` handling with the tested editable-target guards.
6. Ensure unsupported pages and missing capabilities remain unchanged.

**Done when**: lifecycle tests demonstrate one mount, successful remount, and no global duplicate listeners.

## T09 — Native visual integration and responsive behavior

**Owner**: Luna Integration

**Files**: `src/biliframe.user.js`, `tests/ui.test.cjs`

**Steps**:

1. Add one namespaced style element.
2. Match the observed 36×22px control geometry, white icon color, hover transition, tooltip behavior, and player z-index conventions.
3. Keep all four controls usable at the observed 732px row and define a compact rule for narrower desktop players.
4. Style modal/status for normal, wide, web-fullscreen, fullscreen, light/dark page surroundings, and reduced motion.
5. Assert style uniqueness and required accessibility labels in tests.

**Done when**: styles do not override native selectors globally and tests remain green.

## T10 — User documentation

**Owner**: Luna Docs (may run in parallel before final QA)

**Files**: `README.md`, `LICENSE`, `docs/VALIDATION.md`

**Steps**:

1. Document BiliFrame identity, features, supported routes, install/update steps, buttons, shortcuts, privacy, permissions, and limitations in Chinese.
2. Explain that the `.user.js` file is directly installable and has no runtime/build dependency.
3. Include a short troubleshooting section for absent buttons, unavailable covers, and canvas restrictions.
4. Add MIT license text for 2026 Celesrain.
5. Create a validation checklist with placeholders for automated and live evidence.

**Done when**: instructions are usable without reading source code and make no claim of GitHub publication.

## T11 — Automated verification

**Owner**: Luna QA (after T03-T10)

**Files**: fix only the smallest files required by failures; update `docs/VALIDATION.md`

**Steps**:

1. Run `npm run verify`.
2. Run `git diff --check` against tracked and untracked additions after staging temporarily if needed, then unstage without discarding changes.
3. Validate userscript metadata contains exactly the intended matches, grants, connection domain, version, and license.
4. Search for accidental telemetry, broad network access, unsafe globals, TODO/FIXME, and unnamespaced selectors.
5. Record command output summaries and any limitations.

**Done when**: all checks pass with no ignored failures or disabled tests.

## T12 — Live Bilibili structural acceptance

**Owner**: Luna QA

**Files**: `docs/VALIDATION.md` only unless a live finding proves a compatibility defect

**Steps**:

1. Use the available browser-computer capability and the required computer-use skill instructions.
2. Inspect one current desktop `/video/*` page without installing the userscript or changing account state.
3. Confirm player root, active video, control group, semantic play anchor, native dimensions, and cover source.
4. Compare live evidence with adapter fallbacks and record what was and was not E2E-tested.
5. Do not claim userscript runtime E2E unless it was actually installed/executed with permission.

**Done when**: the validation document distinguishes DOM compatibility, Node integration, and unperformed extension-runtime E2E.

## T13 — Plan closure and Git commits

**Owner**: Luna Release (after T11 and T12)

**Files**: `IMPLEMENTATION_PLAN.md` removal, any final documentation status cleanup

**Steps**:

1. Review every task report and working-tree diff.
2. Re-run `npm run verify` and `git diff --check`.
3. Update permanent docs with any final caveats.
4. Remove `IMPLEMENTATION_PLAN.md` because all stages are complete; retain this task board and `docs/DESIGN.md` as project history.
5. Create clear local commits that separate implementation from final documentation/validation when practical.
6. Confirm `git status --short --branch` is clean and show the final log.

**Done when**: the local repository is clean, committed, and ready for a separately authorized GitHub publication step.

## Completion ledger (2026-09-06)

- T01-T13: **Complete**.
- T12 live structural evidence: supplied by the coordinator's pre-delegation observation and recorded in `docs/VALIDATION.md`; the delegated browser attempt had no available browser surface.
- Tampermonkey runtime E2E: **not executed**; no userscript installation, GM API runtime check, or GitHub publication was performed.
