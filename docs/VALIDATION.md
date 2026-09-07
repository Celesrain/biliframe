# BiliFrame validation checklist

本文记录公开维护者可重复执行的自动化检查、手工验收项目和验证边界。除已标明的自动化结果外，不把静态测试或 DOM 观察描述为用户脚本运行时 E2E。

## 自动化检查

- [x] `npm run check`：Node 语法检查通过。
- [x] `npm test`：Node 内置测试套件全部通过（59 tests）。
- [x] `npm run verify`：语法检查和测试均通过。
- [x] `git diff --check`：无空白错误。
- [x] 用户脚本元数据：匹配路由、权限、连接域、版本和许可证与 README 一致。
- [x] 静态审计：无意外网络请求、遥测、Cookie、账号数据、危险全局或未命名空间的样式选择器。
- [x] 全屏状态生命周期自动化：覆盖现代/legacy 状态、原生全屏元素与播放器双向包含、进入/退出同步、属性观察、全屏事件调度及销毁后的监听清理。
- [x] 交互视觉自动化约束：hover、focus-visible、active 时控件外层保持 `background: transparent` 且不使用 `rgba` 背景；仅后代 `.bili-frame-icon` 使用 `#00aeec` 与 `drop-shadow` 高亮，交互规则不覆盖全屏 `transform`，基础图标具备 `color/filter` 过渡且 reduced-motion 会关闭过渡。

## 全屏控件对齐检查

- [x] UI 自动化断言自定义控件为原生同构的 `div[role="button"][tabindex="0"]`，且每个控件只有一个带 `bpx-player-ctrl-btn-icon` 的 SVG wrapper。
- [x] UI 自动化断言 Enter、Space 和 click 均触发同一动作并阻止事件冒泡；legacy 播放器锚点仍按原有 fallback 工作。
- [x] UI 自动化断言插件按钮严格限定在当前 control group 内查找原生“下一个”按钮，并在现代、legacy、语义标签三类锚点后连续插入；无锚点时回退到播放按钮后，重复挂载不复制或重排，SPA 控件组替换后重新遵守该顺序。
- [x] UI 自动化断言外层使用 `display:block`、`position:relative`、`line-height:22px`、`height:22px`，wrapper 使用 100% 宽高和 flex 居中；拒绝 `inline-flex`、外层 `align-*`、`transform`、`top`、`margin` 偏移方案。
- [x] UI 自动化断言基础 `.bili-frame-icon` 为 `transform:none`，且唯一的 `translateY(-5px)` 规则仅覆盖带插件自有 `data-bili-frame-fullscreen="true"` 属性的控件；该属性由现代 `data-screen="web"`/`"full"`、legacy 全屏类及原生 `fullscreenElement`/`webkitFullscreenElement` 双向包含关系同步，正常、宽屏、窄屏模式不偏移，外层控件与 wrapper 仍保持零位移。
- [x] 现场 DOM 盒模型测量：`.bpx-player-control-bottom-left` 为 `display:flex`、高度 35px；原生播放按钮约 36×22px；自动化契约确保自定义 wrapper 的图标几何中心随同一外层行居中。
- [ ] 真实 Tampermonkey 原生 Fullscreen API E2E：当前测试环境点击全屏后 `document.fullscreenElement` 仍为 `false`，只能确认现场 DOM 盒模型、全屏选择器契约和自动化结构契约，不能把该观察冒充原生全屏 E2E。

## 图片文件名模板检查

- [x] 菜单可打开图片名设置并显示 `{{title}}`、`{{identity}}`、`{{bvid}}`、`{{timestamp}}`、`{{date}}`、`{{time}}`、`{{kind}}`；其中 `{{identity}}` 为 BV/ep 等页面标识，`{{kind}}` 实际值为 `frame` 或 `cover`（Node/fake-DOM 自动化覆盖）。
- [x] 自定义模板保存后，当前会话后续截图和封面下载立即使用新模板。
- [x] 恢复默认模板后，默认命名行为恢复。
- [x] 缺失占位符值、未知占位符、空模板、Windows 保留名和非法字符均安全处理。
- [x] 扩展名由图片类型自动追加，模板不能改变为不安全的扩展名。
- [x] 无可用 GM 存储或菜单 API 时保持默认模板并安全降级。

## 手工验收

- [ ] 支持的桌面路由出现四个控件，顺序、提示、键盘激活和快捷键正确。
- [ ] 播放器重建和单页导航后只保留一组控件，逐帧状态重新绑定。
- [ ] 普通、宽屏、网页全屏、原生全屏、窄控制栏和深浅背景下布局可用。
- [ ] 截图和封面先显示预览；只有用户点击预览操作按钮后才下载、打开或复制。
- [ ] 无封面、视频未就绪、画布受限和管理器 API 失败时显示明确错误。
- [ ] 在兼容的用户脚本管理器中安装后，确认 GM 存储、菜单和图片下载行为（Tampermonkey 运行时 E2E 尚未执行）。

## 已知边界

- 移动端、直播、第三方嵌入播放器和离线客户端不在支持范围内。
- 未安装并执行用户脚本时，Node/fake-DOM 测试和静态 DOM 观察不等于 Tampermonkey 运行时 E2E。
- 可变帧率媒体的逐帧操作是浏览器时间线近似，不承诺 codec 级逆向解码精度。
- 跨域或受保护视频画布可能无法导出截图；脚本不绕过浏览器安全策略。
