# BiliFrame design

## Product identity

- Project name: **BiliFrame**
- Repository name: `biliframe`
- Userscript name: `BiliFrame - 哔哩哔哩逐帧与截图工具`
- Initial release: `0.1.0`
- Primary audience: desktop Bilibili viewers using Tampermonkey-compatible userscript managers

The name is short enough for GitHub and package metadata while describing the project's central capability: frame-level controls for Bilibili.

## Observed Bilibili contract (2026-09-06)

The implementation is based on a live desktop video page rather than a copied static example:

- Page family: `https://www.bilibili.com/video/<BV id>`
- Player root: `#bilibili-player`
- Active media: an HTML `<video>` inside `.bpx-player-video-wrap`
- Control row: `.bpx-player-control-bottom`
- Left insertion group: `.bpx-player-control-bottom-left`
- Stable semantic anchor: `[aria-label="播放/暂停"]`
- Native button shape: `.bpx-player-ctrl-btn`, 36px wide in the observed 732px control row
- Cover source: `meta[property="og:image"]`; the observed URL ended in a Bilibili `@1200w_630h` processing suffix

Selectors are treated as an ordered adapter, not a single hard dependency. Semantic and legacy fallbacks are kept together, and a mutation observer remounts the controls after Bilibili replaces the player DOM.

## Supported page families

The userscript metadata covers desktop playback routes that reuse Bilibili's HTML5 player:

- `/video/*`
- `/bangumi/play/*`
- `/medialist/play/*`
- `/list/watchlater*`
- `/festival/*`

The adapter only mounts when both an active video element and a recognized player control group exist. Unsupported pages therefore remain unchanged.

## User interface

Four icon buttons are inserted immediately after the native play/pause button:

1. Previous frame
2. Next frame
3. Current-frame PNG capture
4. Cover preview

The buttons reuse the native control class and dimensions, but all custom styling is namespaced under `bili-frame-*`. Each button has `role="button"`, `tabindex="0"`, an `aria-label`, a title with its shortcut, and keyboard activation for Enter/Space.

A small status pill reports pause/seek time, measured FPS, saves, copies, and actionable failures. The cover opens in a keyboard-dismissible modal with:

- the original-resolution image suitable for right-click saving;
- a filename preview;
- Download original;
- Open original;
- Copy image URL.

## Frame stepping

Browsers do not expose a universal reverse-decoder API. BiliFrame therefore uses the video timeline carefully:

1. Observe decoded frames continuously with `HTMLVideoElement.requestVideoFrameCallback` when available.
2. Keep a bounded set of plausible positive `mediaTime` deltas and use their median as the current frame duration.
3. Ignore large discontinuities caused by seeks, buffering, advertisements, or part changes.
4. On a step, pause first and seek by one measured duration without using `fastSeek` (which intentionally favors keyframes).
5. Clamp the target to `[0, duration]` and use 30fps only until reliable samples exist.

This gives exact timeline steps for constant-frame-rate streams and the best browser-supported approximation for variable-frame-rate streams. The status pill exposes the effective FPS rather than claiming codec-level reverse decoding.

Keyboard shortcuts are `Alt+,` and `Alt+.` for previous/next frame. They are ignored in inputs, textareas, selects, buttons, links, content-editable elements, and while other modifiers are held.

## Cover and screenshot behavior

Cover resolution order:

1. Open Graph image metadata
2. `itemprop=image` metadata
3. `link[rel=image_src]`
4. recognized visible cover images in the page

Bilibili's trailing `@...` image transformation is removed only from recognized image-path suffixes. Query strings and ordinary `@` characters are preserved.

Cover download is user-triggered through `GM_download` and limited by metadata to `hdslb.com` (including its subdomains). If the userscript manager cannot download directly, BiliFrame opens the original image so the browser can save it normally.

Current-frame capture draws the displayed video frame to a canvas at `videoWidth × videoHeight`, saves a PNG with the BV/episode title and timestamp, and reports cross-origin/canvas failures instead of silently doing nothing.

## Navigation and lifecycle

- A debounced `MutationObserver` watches for player replacement.
- `popstate`, `hashchange`, and patched history events schedule a remount for SPA navigation.
- A mount is keyed to the actual control group and never creates duplicates.
- The active video is selected from visible candidates by player containment, ready state, and rendered area.
- Frame observation is rebound when the active video changes.
- Dialog nodes and event listeners are cleaned up when replaced or closed.

## Privacy and permissions

- No analytics, telemetry, cookies, storage, account data, or background network requests.
- `GM_download` is used only after the user clicks Download original.
- `GM_setClipboard` is used only after the user clicks a copy action.
- `GM_openInTab` is used only after the user clicks Open original.
- No page globals, credentials, or private Bilibili APIs are read.

## Explicit exclusions

- Mobile Bilibili pages, embedded third-party players, live streams, and offline clients
- Video/audio stream downloading, merging, transcoding, or VIP/DRM/access-control bypass
- Editing Bilibili's own keyboard shortcuts or playback settings
- Codec-level reverse decoding beyond what the browser media timeline exposes
- Automatic installation of Tampermonkey or the userscript
- Publishing, creating, or pushing a GitHub repository during this implementation unless separately requested

## Compatibility risk controls

- Prefer semantic anchors and ordered fallbacks over deep child selectors.
- Keep every custom class, data attribute, and CSS variable namespaced.
- Stop propagation only on BiliFrame controls, never globally.
- Fail visibly and leave the native player untouched when required capabilities are absent.
- Keep the project dependency-free so the checked-in `.user.js` is directly installable from GitHub raw content.
