# BiliFrame design

## Product identity

- Project name: **BiliFrame**
- Repository name: `biliframe`
- Userscript name: `BiliFrame - 哔哩哔哩逐帧与截图工具`
- Initial release: `0.1.0`
- Primary audience: desktop Bilibili viewers using Tampermonkey-compatible userscript managers

The name is short enough for GitHub and package metadata while describing the project's central capability: frame-level controls for Bilibili.

## Bilibili compatibility contract

The adapter targets desktop playback pages such as `https://www.bilibili.com/video/<BV id>`.
It uses ordered semantic and legacy fallbacks for `#bilibili-player`, the active `<video>` in
`.bpx-player-video-wrap`, `.bpx-player-control-bottom`,
`.bpx-player-control-bottom-left`, and `[aria-label="播放/暂停"]`. A mutation observer remounts
controls after player replacement. These are compatibility contracts, not a guarantee of any
particular live page layout.

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

The buttons reuse the native control class and width, but all custom styling is namespaced under `bili-frame-*`. BiliFrame does not fix the button height: the shared native class remains responsible for normal/fullscreen sizing, while block-level SVG flex items stay centered without an inline baseline offset. Each button has `role="button"`, `tabindex="0"`, an `aria-label`, a descriptive title, and keyboard activation for Enter/Space. Only the previous/next-frame titles advertise shortcuts; capture and cover are direct-click controls.

A small status pill reports pause/seek time and measured FPS. Both image controls use a keyboard-dismissible, preview-first native `<dialog>` opened with `showModal()`, placing the preview in the browser top layer even when the player is fullscreen. A non-dialog fallback retains compatibility with older engines. Image-action outcomes are also rendered inside the preview so they remain visible there. The current-frame modal provides Download screenshot and Copy current-time URL; the cover modal provides:

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

### Image filename templates

Screenshot and cover downloads use one user-editable template. The supported placeholders are
`{{title}}`, `{{identity}}`, `{{bvid}}`, `{{timestamp}}`, `{{date}}`, `{{time}}`, and `{{kind}}`.
The `{{identity}}` value is the page's video identifier, such as a BV or episode (`ep`) number;
`{{bvid}}` remains as a convenient alias for users who specifically want the BV number.
The `{{kind}}` value is `frame` for screenshots and `cover` for original covers.
The resolver substitutes missing values with safe fallbacks, strips filesystem-illegal
characters, prevents empty or reserved Windows names, and appends the image extension rather
than allowing a template to choose an unsafe extension. The default template preserves the
existing title plus video-identity naming behavior.

The Tampermonkey menu exposes the template editor and a restore-default action. Settings use the
userscript manager's storage adapter (`GM_getValue`/`GM_setValue`) when available; if storage or
menu APIs are unavailable, BiliFrame keeps the default template and safely degrades instead of
failing image capture. A saved change applies to later downloads in the current session
immediately.

Clicking either image control first opens a visible preview and performs no download, tab opening, or clipboard write. Bootstrap captures the granted `GM_download`, `GM_openInTab`, and `GM_setClipboard` functions from the userscript sandbox explicitly instead of assuming that they are properties of the page window. Cover download is user-triggered through `GM_download` and limited by metadata to `hdslb.com` (including its subdomains). If the userscript manager cannot download directly, BiliFrame can open the original image so the browser can save it normally.

Current-frame capture draws the displayed video frame to a canvas at `videoWidth × videoHeight`, shows the resulting PNG in the shared preview, and downloads it only after the user clicks Download screenshot. The filename uses the title plus BV/episode identity. Cross-origin/canvas failures are reported visibly instead of silently doing nothing.

## Navigation and lifecycle

- A debounced `MutationObserver` watches for player replacement.
- `popstate`, `hashchange`, and patched history events schedule a remount for SPA navigation.
- A mount is keyed to the actual control group and never creates duplicates.
- The active video is selected from visible candidates by player containment, ready state, and rendered area.
- Frame observation is rebound when the active video changes.
- Dialog nodes and event listeners are cleaned up when replaced or closed.

## Privacy and permissions

- No analytics, telemetry, cookies, account data, or background network requests. Apart from one local filename template string, no user or account data is stored.
- `GM_download` is used only after the user clicks Download screenshot or Download original in a preview; callbacks update the preview with completion or a concrete manager/browser failure.
- `GM_setClipboard` is used only after the user clicks a copy action.
- `GM_openInTab` is used only after the user clicks Open original and requests an active child tab.
- `GM_getValue` and `GM_setValue` store only the single filename template string.
- `GM_registerMenuCommand` and `GM_unregisterMenuCommand` only create and remove the filename-settings menu entry.
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
