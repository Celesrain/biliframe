# BiliFrame validation checklist

本文只提供分层验证清单。执行者应在完成每一项后填入日期、命令、结果摘要和证据位置；当前未在此文档中虚构任何已通过的运行或现场结果。

## 1. 静态与自动化检查

- [x] `npm run check`；日期：2026-09-06；结果：通过；`node --check src/biliframe.user.js` 无输出且退出码 0。
- [x] `npm test`；日期：2026-09-06；结果：通过，40/40 测试通过，0 失败。
- [x] `npm run verify`；日期：2026-09-06；结果：通过；依次完成 `npm run check` 与 `npm test`，40/40 测试通过。
- [x] `git add -N -- .; git diff --check; git reset -- .`；日期：2026-09-06；结果：通过；包含未跟踪新增文件的 diff 检查无空白错误，随后已安全取消暂存且未丢弃改动。
- [x] 用户脚本元数据；日期：2026-09-06；结果：通过；`@name` 为 `BiliFrame - 哔哩哔哩逐帧与截图工具`，namespace 为 `https://github.com/Celesrain/biliframe`，version 为 `0.1.0`，author 为 `Celesrain`，license 为 `MIT`；恰有 5 个 desktop `@match`（video、bangumi/play、medialist/play、list/watchlater、festival），恰有 3 个 grants（`GM_download`、`GM_openInTab`、`GM_setClipboard`），恰有 `@connect hdslb.com`，`@run-at` 为 `document-start`。
- [x] 风险关键词与选择器审计；日期：2026-09-06；结果：通过；在 `src/` 中未发现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、analytics/telemetry、cookie、localStorage、unsafeWindow、`eval`、TODO/FIXME；仅有预期的 `GM_*` 用户触发适配器。样式规则均使用 `bili-frame-` 命名空间；播放器/媒体查询使用 DESIGN 记录的原生选择器。未发现宽泛 `@connect`。

自动化边界：上述检查覆盖 Node 语法、Node/UI 集成测试、用户脚本元数据、静态网络/全局/样式审计；未安装或执行用户脚本，也未验证真实浏览器、Bilibili 页面、Tampermonkey API 或 live DOM。

## 2. DOM 结构兼容性（只读现场检查）

在一个当前桌面端 `https://www.bilibili.com/video/<BV id>` 页面记录以下项目。不要安装脚本、改变账号状态或声称已完成用户脚本运行时 E2E：

- [ ] 播放器根节点：`#bilibili-player`；结果：____
- [ ] 活跃媒体：`.bpx-player-video-wrap` 内的 `<video>`；结果：____
- [ ] 控制栏：`.bpx-player-control-bottom`；结果：____
- [ ] 原生播放锚点：`[aria-label="播放/暂停"]`；结果：____
- [ ] 原生控制按钮尺寸约为 36px 宽；结果：____；测量：____
- [ ] 封面来源可由 `meta[property="og:image"]` 获取；结果：____；URL 是否含处理后缀：____
- [ ] 与 DESIGN 中的现代选择器和 legacy fallback 对照；差异：____

## 3. Node/UI 集成验证

- [ ] 记录适配器选择、视频选择、四按钮顺序与可访问属性；日期：____；结果：____；证据：____
- [ ] 记录点击、Enter/Space、传播控制和重复挂载行为；日期：____；结果：____；证据：____
- [ ] 记录逐帧暂停/定位、边界钳制、30 FPS 回退和视频重绑定；日期：____；结果：____；证据：____
- [ ] 记录封面候选优先级、模态关闭和媒体操作错误路径；日期：____；结果：____；证据：____
- [ ] 记录 SPA 导航、播放器重建、快捷键 editable-target 防护和样式唯一性；日期：____；结果：____；证据：____

## 4. 用户脚本运行时验收（需明确授权）

- [ ] 是否实际在兼容用户脚本管理器中安装并执行：是 / 否；若否，不能宣称 E2E 完成。
- [ ] 支持路由的按钮顺序、提示、快捷键和截图/封面操作；结果：____
- [ ] 宽屏、网页全屏、全屏、深浅背景和窄控制栏；结果：____
- [ ] 失败提示（无封面、未就绪视频、画布限制、管理器 API 失败）可见；结果：____
- [ ] 运行时网络请求仅来自用户主动的封面打开/下载；结果：____
- [ ] 测试环境、浏览器、脚本管理器版本和页面 BV：____

## 5. 已知未覆盖项

- 移动端、直播、第三方嵌入播放器和离线客户端未纳入兼容性验收。
- 未经明确安装和执行，不把 DOM 检查或 Node 测试当作用户脚本 E2E 结果。
- 可变帧率媒体的“逐帧”是时间线近似，不承诺 codec 级逆向解码精度。

## 6. 本次 T12 现场记录（2026-09-06）

- **状态**：阻塞，未取得 live DOM 证据。
- **尝试**：按 `computer-use` 技能要求完成只读浏览器选择；CUA 状态返回 `apps: []`、`browsers: []`。创建 in-app 浏览器失败：`Browser is not available: iab`；按 URL 选择浏览器失败：`No browser is available`。
- **因此未验证**：页面 URL family/title、`#bilibili-player`、活跃 `<video>` 与 `.bpx-player-video-wrap` 所属关系、`.bpx-player-control-bottom`、left group、`[aria-label="播放/暂停"]`、原生按钮 class/rect、控制行尺寸、`og:image`、遮罩和动态替换。
- **安全边界**：未安装 userscript 或浏览器扩展，未登录，未点赞/评论/下载，未改变账号或页面状态。
- **验证结论**：本记录不能证明 live DOM 兼容性；Node fake-DOM integration 与 live DOM 是不同层级，须分别记录。Tampermonkey runtime E2E 本次未执行。

## 7. 协调者预委派现场证据（2026-09-06）

以下内容来自 **coordinator pre-delegation observation**：协调者在本轮委派前完成的真实、只读桌面 Bilibili 页面观察。它不是本任务中 CUA 的现场观察；与第 6 节的 CUA 不可用记录并存。

- **页面**：URL family 为 `https://www.bilibili.com/video/BV1TctC6zEX4/`；标题为“挑战只能使用枪主角通关原神？！”（按用户提供证据记录）。
- **播放器根节点**：存在 `#bilibili-player`。
- **活跃媒体**：存在可用 `HTMLVideoElement`，位于 `.bpx-player-video-wrap` 内；`readyState` 可用，intrinsic 尺寸为 `640×360`。
- **控制栏**：存在 `.bpx-player-control-bottom`，实测 rect 约为 `x=76.33, y=545, w=732, h=35`。
- **左侧控制组**：存在 `.bpx-player-control-bottom-left`。
- **播放锚点**：存在 `[aria-label="播放/暂停"]`，class 为 `bpx-player-ctrl-btn bpx-player-ctrl-play`，实测 rect 为 `36×22`。
- **原生按钮几何**：观察到其它原生控制按钮同为 `36×22`；这与 DESIGN 中“36px 控件”的宽度契约一致（高度记录为 22px）。
- **封面来源**：`meta[property="og:image"]` 为 `https://i2.hdslb.com/bfs/archive/fe87dfb51444d0ac8c8352be7004ab35e1444e89.jpg@1200w_630h`；按 `normalizeCoverUrl` 预期，仅移除 Bilibili 图像处理 `@1200w_630h` 后缀，得到 `.jpg` 原图 URL，不应改动普通 query 或路径中的其它 `@`。
- **遮罩与动态状态**：页面稍后出现登录弹窗；关闭后 `#bilibili-player` 等 player DOM 仍在。该证据说明页面可能存在遮罩/动态状态，但不证明播放器 DOM 被替换，也不构成 userscript runtime E2E。

### 与设计及适配器的结构对照

上述证据覆盖 DESIGN 中记录的现代根节点、视频 wrap、控制栏、left group、语义播放锚点及 `og:image` 封面来源，并与源码适配器的这些优先选择器相符。legacy fallback、播放器重建后的 mutation remount、四个 BiliFrame 控件的真实浏览器挂载行为仍需独立验证；本记录只证明一次 live DOM 结构样本。

### 验证边界

- **已验证**：一次桌面 `/video/*` 页面样本的 live DOM 结构、媒体可用性/内禀尺寸、控制栏与原生按钮几何、Open Graph 封面及处理后缀归一化预期。
- **另行验证**：Node fake-DOM integration 属于本地测试层，不等于真实浏览器或 Tampermonkey 行为。
- **未执行**：Tampermonkey runtime E2E；未安装或执行 userscript，未验证 GM API、真实四按钮交互、截图导出、下载/打开/剪贴板操作或 SPA 重挂载。
