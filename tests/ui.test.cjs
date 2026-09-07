'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDom, FakeEvent } = require('./support/fake-dom.cjs');
const {
  findPlayerAdapter,
  chooseActiveVideo,
  mountControls,
  createFrameClock,
  createFrameStepAction,
  createCoverModal,
  createFilenameSettingsMenu,
  bootstrap,
  resolveCoverUrl,
  createUserscriptAdapters,
  buildCoverFilename,
  buildFilenameFromTemplate,
  captureCurrentFrame,
  copyTimestampLink,
  createMediaActions,
  createLifecycleController,
  ensureStyles,
  isFullscreenPlayerState,
  syncFullscreenControlState,
} = require('../src/biliframe.user.js');

// The fixture DOM intentionally keeps the native tree small; expose the browser
// sibling primitive needed to exercise insertion order against real controls.
const fakeElementPrototype = Object.getPrototypeOf(createDom().document.createElement('div'));
if (!Object.getOwnPropertyDescriptor(fakeElementPrototype, 'nextSibling')) {
  Object.defineProperty(fakeElementPrototype, 'nextSibling', {
    configurable: true,
    get() {
      const siblings = this.parentNode?.children || [];
      const index = siblings.indexOf(this);
      return index >= 0 ? siblings[index + 1] || null : null;
    },
  });
}

function playerFixture({ legacy = false } = {}) {
  const { document } = createDom();
  const player = document.createElement('div');
  player.id = legacy ? 'bilibili-player' : 'bilibili-player';
  const videoWrap = document.createElement('div');
  videoWrap.className = legacy ? 'bilibili-player-video-wrap' : 'bpx-player-video-wrap';
  const controls = document.createElement('div');
  controls.className = legacy ? 'bilibili-player-video-control-bottom' : 'bpx-player-control-bottom';
  const left = document.createElement('div');
  left.className = legacy ? 'bilibili-player-video-control-bottom-left' : 'bpx-player-control-bottom-left';
  const play = document.createElement('button');
  play.className = legacy ? 'bilibili-player-video-btn-start' : 'bpx-player-ctrl-btn';
  play.setAttribute('aria-label', legacy ? '播放' : '播放/暂停');
  left.appendChild(play);
  controls.appendChild(left);
  player.append(videoWrap, controls);
  document.body.appendChild(player);
  return { document, player, videoWrap, controls, left, play };
}

function appendNativeNextButton(fixture, variant = 'modern') {
  const next = fixture.document.createElement('button');
  if (variant === 'modern') next.className = 'bpx-player-ctrl-next';
  if (variant === 'legacy') next.className = 'bilibili-player-video-btn-next';
  if (variant === 'aria') next.setAttribute('aria-label', '下一个');
  if (variant === 'title') next.setAttribute('title', '下一个');
  fixture.left.appendChild(next);
  return next;
}

function replaceControlBar(fixture, { legacy = false, nextVariant = 'modern' } = {}) {
  const controls = fixture.document.createElement('div');
  controls.className = legacy ? 'bilibili-player-video-control-bottom' : 'bpx-player-control-bottom';
  const left = fixture.document.createElement('div');
  left.className = legacy ? 'bilibili-player-video-control-bottom-left' : 'bpx-player-control-bottom-left';
  const play = fixture.document.createElement('button');
  play.className = legacy ? 'bilibili-player-video-btn-start' : 'bpx-player-ctrl-btn';
  play.setAttribute('aria-label', legacy ? '播放' : '播放/暂停');
  left.appendChild(play);
  controls.appendChild(left);
  fixture.player.removeChild(fixture.controls);
  fixture.player.appendChild(controls);
  fixture.controls = controls;
  fixture.left = left;
  fixture.play = play;
  return appendNativeNextButton(fixture, nextVariant);
}

test('adapter prefers modern semantic anchors and supports one legacy fallback', () => {
  const modern = playerFixture();
  const adapter = findPlayerAdapter(modern.document);
  assert.equal(adapter.controlGroup, modern.controls);
  assert.equal(adapter.playButton, modern.play);

  const legacy = playerFixture({ legacy: true });
  const fallback = findPlayerAdapter(legacy.document);
  assert.equal(fallback.controlGroup, legacy.controls);
  assert.equal(fallback.playButton, legacy.play);
});

test('fullscreen state recognizes modern, legacy, and document fullscreen signals', () => {
  const fixture = playerFixture();
  const adapter = findPlayerAdapter(fixture.document);
  fixture.player.className = 'bpx-player-container';

  for (const state of ['web', 'full']) {
    fixture.player.setAttribute('data-screen', state);
    assert.equal(isFullscreenPlayerState(adapter, fixture.document), true, `modern ${state}`);
  }
  for (const state of ['normal', 'wide', 'mini']) {
    fixture.player.setAttribute('data-screen', state);
    assert.equal(isFullscreenPlayerState(adapter, fixture.document), false, `modern ${state}`);
  }

  fixture.player.removeAttribute('data-screen');
  fixture.player.className = 'mode-webscreen';
  assert.equal(isFullscreenPlayerState(adapter, fixture.document), true);
  fixture.player.className = 'mode-fullscreen';
  assert.equal(isFullscreenPlayerState(adapter, fixture.document), true);
  fixture.player.className = '';

  const nestedFullscreenNode = fixture.document.createElement('div');
  fixture.player.appendChild(nestedFullscreenNode);
  fixture.document.fullscreenElement = nestedFullscreenNode;
  assert.equal(isFullscreenPlayerState(adapter, fixture.document), true);
  fixture.document.fullscreenElement = null;
  const fullscreenAncestor = fixture.document.createElement('div');
  fixture.document.body.appendChild(fullscreenAncestor);
  fullscreenAncestor.appendChild(fixture.player);
  fixture.document.webkitFullscreenElement = fullscreenAncestor;
  assert.equal(isFullscreenPlayerState(adapter, fixture.document), true);
  fixture.document.webkitFullscreenElement = null;
  assert.equal(isFullscreenPlayerState(adapter, fixture.document), false);
});

test('fullscreen control state is synchronized idempotently and clears in normal playback', () => {
  const fixture = playerFixture();
  const adapter = findPlayerAdapter(fixture.document);
  const controls = mountControls(adapter, {}).controls;
  fixture.player.className = 'bpx-player-container';
  fixture.player.setAttribute('data-screen', 'web');

  assert.equal(syncFullscreenControlState(adapter, controls, fixture.document), true);
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === 'true'));
  const firstAttributes = controls.map((control) => control.getAttribute('data-bili-frame-fullscreen'));
  assert.equal(syncFullscreenControlState(adapter, controls, fixture.document), true);
  assert.deepEqual(
    controls.map((control) => control.getAttribute('data-bili-frame-fullscreen')),
    firstAttributes,
  );

  fixture.player.setAttribute('data-screen', 'normal');
  assert.equal(syncFullscreenControlState(adapter, controls, fixture.document), false);
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === null));
  assert.equal(syncFullscreenControlState(adapter, controls, fixture.document), false);
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === null));
});

test('active video is the visible, ready, largest candidate inside the player', () => {
  const fixture = playerFixture();
  const candidates = [
    { readyState: 4, clientWidth: 1280, clientHeight: 720, hidden: false },
    { readyState: 4, clientWidth: 1920, clientHeight: 1080, hidden: false },
    { readyState: 0, clientWidth: 3000, clientHeight: 2000, hidden: false },
    { readyState: 4, clientWidth: 4000, clientHeight: 3000, hidden: true },
  ].map((properties) => {
    const video = fixture.document.createElement('video');
    Object.assign(video, properties);
    fixture.videoWrap.appendChild(video);
    return video;
  });
  assert.equal(chooseActiveVideo(fixture.player), candidates[1]);
});

test('mount inserts four accessible controls in order and is idempotent', () => {
  const fixture = playerFixture();
  const actions = { previous: 0, next: 0, capture: 0, cover: 0 };
  const result = mountControls(findPlayerAdapter(fixture.document), actions);
  assert.deepEqual(
    result.controls.map((control) => control.getAttribute('aria-label')),
    ['上一帧', '下一帧', '截取当前画面', '查看视频封面'],
  );
  result.controls.forEach((control) => {
    assert.equal(control.tagName, 'DIV');
    assert.equal(control.getAttribute('type'), null);
    assert.equal(control.getAttribute('role'), 'button');
    assert.equal(control.getAttribute('tabindex'), '0');
    assert.match(control.innerHTML, /bpx-player-ctrl-btn-icon bili-frame-icon-wrap/);
    assert.match(control.innerHTML, /bpx-player-ctrl-btn-icon bili-frame-icon-wrap[\s\S]*<svg/);
  });
  assert.equal(result.controls[0].getAttribute('title'), '上一帧（Alt+,）');
  assert.equal(result.controls[1].getAttribute('title'), '下一帧（Alt+.）');
  assert.equal(result.controls[2].getAttribute('title'), '截取当前画面');
  assert.equal(result.controls[3].getAttribute('title'), '查看视频封面');
  assert.doesNotMatch(result.controls[2].getAttribute('title'), /Alt|click/i);
  assert.doesNotMatch(result.controls[3].getAttribute('title'), /Alt|click/i);
  assert.deepEqual(fixture.left.children.slice(1), result.controls);
  assert.equal(mountControls(findPlayerAdapter(fixture.document), actions).controls.length, 4);
  assert.equal(fixture.left.children.length, 5);
});

test('mount appends controls after the modern native next button', () => {
  const fixture = playerFixture();
  const next = appendNativeNextButton(fixture, 'modern');
  const mounted = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  assert.deepEqual(fixture.left.children, [fixture.play, next, ...mounted]);
});

test('mount appends controls after the legacy native next button', () => {
  const fixture = playerFixture({ legacy: true });
  const next = appendNativeNextButton(fixture, 'legacy');
  const mounted = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  assert.deepEqual(fixture.left.children, [fixture.play, next, ...mounted]);
});

test('mount uses semantic next-button labels as fallback anchors', () => {
  for (const variant of ['aria', 'title']) {
    const fixture = playerFixture();
    const next = appendNativeNextButton(fixture, variant);
    const mounted = mountControls(findPlayerAdapter(fixture.document), {}).controls;
    assert.deepEqual(fixture.left.children, [fixture.play, next, ...mounted], variant);
  }
});

test('mount still places controls directly after play when no native next exists', () => {
  const fixture = playerFixture();
  const mounted = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  assert.deepEqual(fixture.left.children, [fixture.play, ...mounted]);
});

test('repeated mount preserves an already-correct next-button order without duplication or reordering', () => {
  const fixture = playerFixture();
  const next = appendNativeNextButton(fixture, 'modern');
  const first = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  const firstOrder = [...fixture.left.children];
  const second = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  assert.deepEqual(second, first);
  assert.deepEqual(fixture.left.children, firstOrder);
  assert.deepEqual(fixture.left.children, [fixture.play, next, ...first]);
});

test('lifecycle mounts after a replacement control group next button during SPA updates', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, duration: 2, currentTime: 1, clientWidth: 640, clientHeight: 360, pause() {} });
  fixture.videoWrap.appendChild(video);
  const harness = lifecycleHarness(fixture);
  harness.controller.start();
  harness.runTimer();
  assert.deepEqual(fixture.left.children.map((node) => node.getAttribute('aria-label')), [
    '播放/暂停', '上一帧', '下一帧', '截取当前画面', '查看视频封面',
  ]);

  replaceControlBar(fixture, { nextVariant: 'modern' });
  harness.getObserverCallback()([{ type: 'childList', target: fixture.player }]);
  harness.runTimer();
  const labels = fixture.left.children.map((node) => node.getAttribute('aria-label'));
  assert.deepEqual(labels, ['播放/暂停', null, '上一帧', '下一帧', '截取当前画面', '查看视频封面']);
  assert.equal(fixture.left.children[1].className, 'bpx-player-ctrl-next');
});

test('controls activate on click, Enter, and Space while stopping propagation', () => {
  const fixture = playerFixture();
  const actions = { previous: 0, next: 0, capture: 0, cover: 0 };
  let parentClicks = 0;
  fixture.left.addEventListener('click', () => { parentClicks += 1; });
  const controls = mountControls(findPlayerAdapter(fixture.document), actions).controls;
  controls[0].click();
  controls[1].dispatchEvent(new FakeEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  controls[2].dispatchEvent(new FakeEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  controls[3].dispatchEvent(new FakeEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  assert.deepEqual(actions, { previous: 1, next: 1, capture: 1, cover: 0 });
  assert.equal(parentClicks, 0);
});

function frameCallbackVideo() {
  const callbacks = new Map();
  const cancelled = [];
  let nextId = 1;
  const video = {
    readyState: 4,
    duration: 10,
    currentTime: 1,
    requestVideoFrameCallback(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelVideoFrameCallback(id) {
      cancelled.push(id);
      callbacks.delete(id);
    },
    emit(mediaTime) {
      const [id, callback] = callbacks.entries().next().value;
      callbacks.delete(id);
      callback(0, { mediaTime });
    },
    pendingIds() { return [...callbacks.keys()]; },
    cancelled,
  };
  return video;
}

test('frame clock binds RVFC, bounds samples, and ignores discontinuities', () => {
  const video = frameCallbackVideo();
  const clock = createFrameClock({ maxSamples: 3 });
  clock.bind(video);
  assert.equal(video.pendingIds().length, 1);
  video.emit(0);
  video.emit(0.04);
  video.emit(0.08);
  video.emit(1.08); // seek/buffering discontinuity: 1s delta is outside the limit.
  video.emit(1.12);
  assert.equal(clock.getSamples().length, 3);
  assert.ok(clock.getSamples().every((sample) => Math.abs(sample - 0.04) < 1e-9));
  assert.ok(Math.abs(clock.getFps() - 25) < 1e-9);
});

test('frame clock rebinding cancels the old callback and clears samples', () => {
  const first = frameCallbackVideo();
  const second = frameCallbackVideo();
  const clock = createFrameClock();
  clock.bind(first);
  first.emit(0);
  first.emit(0.04);
  const oldCallback = first.pendingIds()[0];
  assert.equal(clock.getSamples().length, 1);
  clock.bind(second);
  assert.deepEqual(first.cancelled, [oldCallback]);
  assert.equal(clock.getVideo(), second);
  assert.deepEqual(clock.getSamples(), []);
  assert.equal(second.pendingIds().length, 1);
});

test('frame clock uses a 30fps fallback without RVFC samples', () => {
  const video = { frameRate: undefined };
  const clock = createFrameClock();
  clock.bind(video);
  assert.ok(Math.abs(clock.getFps() - 30) < 1e-9);
  assert.ok(Math.abs(clock.getFrameDuration() - 1 / 30) < 1e-12);
});

test('frame stepping pauses before assigning currentTime, steps both directions, and reports status', () => {
  const operations = [];
  const statuses = [];
  const video = { duration: 1, currentTime: 0.01, pause: () => operations.push('pause') };
  let time = video.currentTime;
  Object.defineProperty(video, 'currentTime', {
    get: () => time,
    set: (value) => { operations.push('seek'); time = value; },
  });
  const action = createFrameStepAction(video, { onStatus: (status) => statuses.push(status) });
  const previous = action.previous();
  assert.equal(previous.direction, -1);
  assert.equal(previous.time, 0);
  video.currentTime = 0.99;
  operations.length = 0;
  const next = action.next();
  assert.equal(next.direction, 1);
  assert.equal(next.time, 1);
  assert.deepEqual(operations, ['pause', 'seek']);
  assert.equal(statuses.length, 2);
  statuses.forEach((status) => {
    assert.equal(typeof status.direction, 'number');
    assert.equal(typeof status.time, 'number');
    assert.equal(typeof status.fps, 'number');
  });
});

test('cover resolution follows metadata priority and normalizes the selected URL', () => {
  const { document } = createDom();
  const og = document.createElement('meta');
  og.setAttribute('property', 'og:image');
  og.setAttribute('content', 'https://i0.hdslb.com/bfs/archive/og.jpg@1200w');
  const item = document.createElement('meta');
  item.setAttribute('itemprop', 'image');
  item.setAttribute('content', 'https://i0.hdslb.com/bfs/archive/item.jpg');
  const image = document.createElement('img');
  image.setAttribute('src', 'https://i0.hdslb.com/bfs/archive/visible.jpg');
  document.body.append(item, image, og);
  assert.equal(resolveCoverUrl(document), 'https://i0.hdslb.com/bfs/archive/og.jpg');
});

test('cover modal is a replaceable singleton with injected actions and focus restore', () => {
  const { document } = createDom();
  let showModalCalls = 0;
  const createElement = document.createElement.bind(document);
  document.createElement = (tagName) => {
    const element = createElement(tagName);
    if (tagName === 'dialog') {
      element.showModal = () => {
        assert.equal(element.isConnected, true);
        showModalCalls += 1;
        element.setAttribute('open', '');
      };
    }
    return element;
  };
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  const calls = [];
  const modalApi = createCoverModal(document, {
    title: '演示',
    actions: {
      download: (url, filename) => calls.push(['download', url, filename]),
      open: (url) => calls.push(['open', url]),
      copy: (url) => calls.push(['copy', url]),
    },
  });
  const first = modalApi.open('https://i0.hdslb.com/bfs/archive/cover.png@672w', opener);
  assert.equal(first.tagName, 'DIALOG');
  assert.equal(showModalCalls, 1);
  assert.equal(document.body.querySelectorAll('[data-bili-frame-modal="cover"]').length, 1);
  const buttons = first.querySelectorAll('[data-bili-frame-modal-action]');
  buttons[0].click();
  buttons[1].click();
  buttons[2].click();
  assert.equal(calls.length, 3);
  const second = modalApi.open('https://i0.hdslb.com/bfs/archive/other.jpg', opener);
  assert.notEqual(first, second);
  assert.equal(showModalCalls, 2);
  assert.equal(document.body.querySelectorAll('[data-bili-frame-modal="cover"]').length, 1);
  second.dispatchEvent(new FakeEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.body.querySelectorAll('[data-bili-frame-modal="cover"]').length, 0);
  assert.equal(document.activeElement, opener);
});

test('media actions stay explicit and report adapter/canvas outcomes', () => {
  let downloadCalls = 0;
  const adapters = createUserscriptAdapters({
    GM_download: () => { downloadCalls += 1; },
    GM_setClipboard: () => {},
  });
  assert.equal(downloadCalls, 0);
  assert.equal(buildCoverFilename('标题', 'BV1xx', 'https://i.hdslb.com/a.jpg'), '标题 - BV1xx.jpg');
  const canvas = {
    getContext: () => ({ drawImage: () => {} }),
    toDataURL: () => 'data:image/png;base64,fake',
  };
  const video = { readyState: 4, videoWidth: 640, videoHeight: 360 };
  const capture = captureCurrentFrame(video, { canvas, adapters, title: '截图' });
  assert.equal(capture.ok, true);
  assert.equal(capture.dataUrl, 'data:image/png;base64,fake');
  assert.equal(downloadCalls, 0);
  assert.equal(copyTimestampLink('https://www.bilibili.com/video/BV1', 2, adapters).ok, true);
  const failures = [];
  assert.equal(captureCurrentFrame({ readyState: 0 }, { adapters, onStatus: (s) => failures.push(s) }).reason, 'unready-video');
  assert.equal(failures.length, 1);
});

test('userscript adapters invoke each GM capability, with false fallbacks for missing or throwing APIs', () => {
  const calls = [];
  const adapters = createUserscriptAdapters({
    GM_download: (details) => calls.push(['download', details]),
    GM_openInTab: (url, options) => calls.push(['open', url, options]),
    GM_setClipboard: (text, type) => calls.push(['copy', text, type]),
  });
  assert.equal(adapters.download({ url: 'data:x', name: 'x.png' }), true);
  assert.equal(adapters.open('https://example.test/cover.png'), true);
  assert.equal(adapters.copy('copied text'), true);
  assert.deepEqual(calls, [
    ['download', { url: 'data:x', name: 'x.png' }],
    ['open', 'https://example.test/cover.png', { active: true, insert: true, setParent: true }],
    ['copy', 'copied text', 'text'],
  ]);

  const fallback = createUserscriptAdapters({
    GM_download: () => { throw new Error('blocked'); },
    GM_setClipboard: undefined,
  });
  assert.equal(fallback.download({}), false);
  assert.equal(fallback.open('https://example.test'), false);
  assert.equal(fallback.copy('text'), false);

  const grantedCalls = [];
  const granted = createUserscriptAdapters({}, {
    GM_download: (details) => grantedCalls.push(['download', details]),
    GM_openInTab: (url, options) => grantedCalls.push(['open', url, options]),
    GM_setClipboard: (text, type) => grantedCalls.push(['copy', text, type]),
  });
  assert.equal(granted.download({ url: 'data:image/png;base64,x', name: 'x.png' }), true);
  assert.equal(granted.open('https://example.test/image.jpg'), true);
  assert.equal(granted.copy('https://example.test/image.jpg'), true);
  assert.deepEqual(grantedCalls.map(([name]) => name), ['download', 'open', 'copy']);
});

test('cover filenames support BV, episode, ordinary identities, source extensions, and Windows limits', () => {
  assert.equal(
    buildCoverFilename({ title: '标题', bvid: 'BV1ABC', coverUrl: 'https://i.hdslb.com/a.webp@1200w' }),
    '标题 - BV1ABC.webp',
  );
  assert.equal(
    buildCoverFilename({ title: '番剧', episode: 'ep12', coverUrl: 'https://i.hdslb.com/a.jpeg' }),
    '番剧 - ep12.jpeg',
  );
  assert.equal(
    buildCoverFilename({ title: '普通标题', identity: 'part-2', coverUrl: 'https://i.hdslb.com/a.png?x=1' }),
    '普通标题 - part-2.png',
  );
  const safe = buildCoverFilename({
    title: 'CON: ' + '很长'.repeat(100) + '?',
    bvid: 'BV1',
    coverUrl: 'https://i.hdslb.com/a.png',
  });
  assert.ok(safe.length <= 120);
  assert.ok(!/[<>:"/\\|?*]/.test(safe));
  assert.ok(safe.endsWith('.png'));
});

test('captureCurrentFrame sizes intrinsic canvas and returns a preview payload without downloading', () => {
  const operations = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => operations.push(['drawImage', ...args]) }),
    toDataURL: (type) => { operations.push(['toDataURL', type]); return 'data:image/png;base64,frame'; },
  };
  const downloads = [];
  const video = { readyState: 4, videoWidth: 1920, videoHeight: 1080, ownerDocument: null };
  const result = captureCurrentFrame(video, {
    canvas,
    title: '标题',
    identity: 'BV1',
    adapters: { download: (details) => { downloads.push(details); return true; } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual([canvas.width, canvas.height], [1920, 1080]);
  assert.deepEqual(operations, [
    ['drawImage', video, 0, 0, 1920, 1080],
    ['toDataURL', 'image/png'],
  ]);
  assert.deepEqual(downloads, []);
  assert.equal(result.dataUrl, 'data:image/png;base64,frame');
  assert.equal(result.filename, '标题 - BV1.png');
});

test('capture and cover previews use the configured filename template', () => {
  const { document } = createDom();
  const video = { readyState: 4, videoWidth: 640, videoHeight: 360, currentTime: 12.5, ownerDocument: document };
  const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,frame' };
  const template = '{{kind}}-{{bvid}}-{{timestamp}}';
  const frame = captureCurrentFrame(video, {
    canvas, title: '标题', identity: 'BV1ABC', bvid: 'BV1ABC', timestamp: 12.5,
    kind: 'frame', filenameTemplate: template,
  });
  assert.equal(frame.filename, 'frame-BV1ABC-00-00-12-500.png');

  const actions = createMediaActions({
    document, video, title: '标题', identity: 'BV1ABC',
    filenameTemplate: template, coverUrl: 'https://i.hdslb.com/a.jpg',
    adapters: { download: () => true },
  });
  const cover = actions.cover();
  assert.equal(cover.ok, true);
  assert.equal(document.body.querySelector('[data-bili-frame-modal-filename]').textContent, 'cover-BV1ABC-00-00-00-000.jpg');
});

test('filename settings menu supports injectable GM storage and registration adapters', () => {
  const { document } = createDom();
  const storage = new Map();
  let command;
  const api = createFilenameSettingsMenu(document, {
    adapters: {
      GM_getValue: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
      GM_setValue: (key, value) => storage.set(key, value),
      GM_registerMenuCommand: (_label, callback) => { command = callback; return 7; },
    },
  });
  assert.equal(typeof command, 'function');
  command();
  const dialog = document.body.querySelector('[data-bili-frame-filename-settings]');
  assert.ok(dialog);
  const input = dialog.querySelector('input');
  assert.ok(input);
  assert.equal(dialog.querySelectorAll('[data-bili-frame-filename-insert]').length, 7);
  assert.ok(dialog.querySelector('[data-bili-frame-filename-insert="identity"]'));
  const insert = dialog.querySelector('[data-bili-frame-filename-insert="bvid"]');
  assert.ok(insert);
  input.value = '{{title}}_{{bvid}}';
  insert.click();
  assert.match(input.value, /\{\{bvid\}\}/);
  dialog.querySelector('[data-bili-frame-filename-preview]').textContent = '';
  input.value = '{{title}}_{{bvid}}';
  input.dispatchEvent(new FakeEvent('input', { bubbles: true }));
  assert.match(dialog.querySelector('[data-bili-frame-filename-preview]').textContent, /示例|标题|BV/i);
  dialog.querySelector('[data-bili-frame-filename-action="save"]').click();
  assert.equal(storage.get('filenameTemplate'), '{{title}}_{{bvid}}');
  assert.equal(api.getTemplate(), '{{title}}_{{bvid}}');
});

test('filename settings menu restores default and cancels without persistence when GM APIs are absent', () => {
  const { document } = createDom();
  const api = createFilenameSettingsMenu(document, { adapters: {} });
  api.open();
  let dialog = document.body.querySelector('[data-bili-frame-filename-settings]');
  assert.ok(dialog.querySelector('[data-bili-frame-filename-action="reset"]'));
  dialog.querySelector('[data-bili-frame-filename-action="reset"]').click();
  assert.equal(dialog.querySelector('input').value, '{{title}} - {{identity}}');
  assert.ok(dialog.querySelector('[data-bili-frame-filename-insert="identity"]'));
  dialog.querySelector('[data-bili-frame-filename-action="cancel"]').click();
  assert.equal(document.body.querySelector('[data-bili-frame-filename-settings]'), null);
  assert.equal(api.getTemplate(), undefined);
});

test('filename settings dialog uses a namespaced content container and refreshes insertion at the caret', () => {
  const { document } = createDom();
  const api = createFilenameSettingsMenu(document, { adapters: {} });
  const dialog = api.open();
  const content = dialog.querySelector('[data-bili-frame-filename-content]');
  assert.ok(content);
  assert.ok(content.querySelector('label'));
  assert.ok(content.querySelector('[data-bili-frame-filename-hint]'));
  const input = content.querySelector('input');
  input.value = '{{title}}';
  input.setSelectionRange(4, 4);
  const button = content.querySelector('[data-bili-frame-filename-insert="bvid"]');
  button.click();
  assert.equal(input.value, '{{ti{{bvid}}tle}}');
  assert.match(content.querySelector('[data-bili-frame-filename-preview]').textContent, /预览/);
  assert.equal(content.querySelector('.bili-frame-filename-settings-heading').textContent, '图片文件名模板');
  assert.match(document.querySelector('#bili-frame-styles')?.textContent || '', /\.bili-frame-filename-template-input/);
  assert.match(document.querySelector('#bili-frame-styles')?.textContent || '', /\.bili-frame-filename-placeholder/);
  assert.match(document.querySelector('#bili-frame-styles')?.textContent || '', /\.bili-frame-filename-actions/);
  assert.match(document.querySelector('#bili-frame-styles')?.textContent || '', /\.bili-frame-filename-preview/);
  dialog.dispatchEvent(new FakeEvent('keydown', { key: 'Escape', code: 'Escape' }));
  assert.equal(document.body.querySelector('[data-bili-frame-filename-settings]'), null);
  api.open();
  api.open();
  assert.equal(document.body.querySelectorAll('[data-bili-frame-filename-settings]').length, 1);
});

test('mounted media actions read a changed filename template on the next click', () => {
  const { document } = createDom();
  const video = { readyState: 4, videoWidth: 640, videoHeight: 360, currentTime: 1, ownerDocument: document };
  const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,frame' };
  let template = '{{title}}-old';
  const actions = createMediaActions({ document, video, title: '标题', identity: 'BV1ABC', canvas, getFilenameTemplate: () => template, adapters: {} });
  assert.equal(actions.capture().filename, '标题-old.png');
  template = '{{title}}-new';
  assert.equal(actions.capture().filename, '标题-new.png');
});

test('bootstrapped controls use a filename template saved after mounting', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, {
    readyState: 4, videoWidth: 640, videoHeight: 360, currentTime: 1,
    clientWidth: 640, clientHeight: 360, ownerDocument: fixture.document,
  });
  fixture.videoWrap.appendChild(video);
  const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,frame' };
  let menuCommand;
  const storage = new Map([['filenameTemplate', '{{title}}-old']]);
  const controller = bootstrap({
    document: fixture.document,
    location: { href: 'https://www.bilibili.com/video/BV1' },
    addEventListener() {},
    removeEventListener() {},
    history: { pushState() {}, replaceState() {} },
    setTimeout: () => 1,
    clearTimeout() {},
  }, {
    canvas,
    adapters: {
      GM_getValue: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
      GM_setValue: (key, value) => storage.set(key, value),
      GM_registerMenuCommand: (_label, callback) => { menuCommand = callback; },
    },
    title: '标题',
    identity: 'BV1ABC',
  });
  controller.ensure();
  const controls = controller.getMounted().controls;
  controls[2].click();
  assert.equal(fixture.document.body.querySelector('[data-bili-frame-modal-filename]').textContent, '标题-old.png');
  fixture.document.body.querySelector('[data-bili-frame-modal-action="close"]').click();
  menuCommand();
  const dialog = fixture.document.body.querySelector('[data-bili-frame-filename-settings]');
  const input = dialog.querySelector('input');
  input.value = '{{title}}-new';
  dialog.querySelector('[data-bili-frame-filename-action="save"]').click();
  controls[2].click();
  assert.equal(fixture.document.body.querySelector('[data-bili-frame-modal-filename]').textContent, '标题-new.png');
  controller.destroy();
});

test('filename menu accepts raw GM injections and only unregisters valid command ids', () => {
  const { document } = createDom();
  const calls = [];
  const raw = {
    GM_registerMenuCommand: (_label, callback) => { calls.push(callback); return undefined; },
    GM_unregisterMenuCommand: (id) => calls.push(id),
  };
  const api = createFilenameSettingsMenu(document, { adapters: raw });
  api.destroy();
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0], 'function');
});

test('captureCurrentFrame reports unready, zero-size, and tainted-canvas failures', () => {
  const statuses = [];
  const base = { canvas: { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:x' } };
  assert.equal(captureCurrentFrame({ readyState: 1, videoWidth: 640, videoHeight: 360 }, { ...base, onStatus: (s) => statuses.push(s) }).reason, 'unready-video');
  assert.equal(captureCurrentFrame({ readyState: 4, videoWidth: 0, videoHeight: 360 }, { ...base, onStatus: (s) => statuses.push(s) }).reason, 'unready-video');
  const tainted = captureCurrentFrame({ readyState: 4, videoWidth: 640, videoHeight: 360 }, {
    canvas: { getContext: () => ({ drawImage() {} }), toDataURL: () => { throw new Error('tainted'); } },
    onStatus: (s) => statuses.push(s),
  });
  assert.equal(tainted.reason, 'canvas-failed');
  assert.deepEqual(statuses.map((status) => status.reason).filter(Boolean), [
    'unready-video', 'unready-video', 'canvas-failed',
  ]);
});

test('copyTimestampLink builds the exact URL and copies only when explicitly called', () => {
  const copied = [];
  const statuses = [];
  const result = copyTimestampLink(
    'https://www.bilibili.com/video/BV1?p=2#reply',
    65.4321,
    { copy: (url) => { copied.push(url); return true; } },
    (status) => statuses.push(status),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(copied, ['https://www.bilibili.com/video/BV1?p=2&t=65.432#reply']);
  assert.deepEqual(statuses, [result]);
});

test('capture and cover actions show operable previews before downstream operations', () => {
  const { document } = createDom();
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  const calls = [];
  const statuses = [];
  const video = {
    readyState: 4,
    videoWidth: 640,
    videoHeight: 360,
    currentTime: 65.432,
    ownerDocument: document,
  };
  const actions = createMediaActions({
    document,
    video,
    title: '演示视频',
    identity: 'BV1TEST',
    pageUrl: 'https://www.bilibili.com/video/BV1TEST',
    coverUrl: 'https://i0.hdslb.com/bfs/archive/cover.jpg@1200w',
    canvas: {
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => 'data:image/png;base64,frame-preview',
    },
    adapters: {
      download: (details) => { calls.push(['download', details]); return true; },
      open: (url) => { calls.push(['open', url]); return true; },
      copy: (text) => { calls.push(['copy', text]); return true; },
    },
    onStatus: (status) => statuses.push(status),
  });

  assert.deepEqual(calls, []);
  const capture = actions.capture(opener);
  assert.equal(capture.ok, true);
  assert.equal(capture.preview, true);
  let modal = document.body.querySelector('[data-bili-frame-modal="frame"]');
  assert.ok(modal);
  assert.equal(modal.querySelector('img').getAttribute('src'), 'data:image/png;base64,frame-preview');
  assert.deepEqual(calls, []);
  modal.querySelector('[data-bili-frame-modal-action="download"]').click();
  assert.equal(calls[0][0], 'download');
  assert.equal(calls[0][1].name, '演示视频 - BV1TEST.png');
  assert.match(
    modal.querySelector('[data-bili-frame-modal-feedback]').textContent,
    /下载截图/,
  );
  assert.equal(typeof calls[0][1].onerror, 'function');
  calls[0][1].onerror({ error: 'not_permitted' });
  assert.match(
    modal.querySelector('[data-bili-frame-modal-feedback]').textContent,
    /截图下载失败.*下载权限/,
  );

  const cover = actions.cover(opener);
  assert.equal(cover.ok, true);
  assert.equal(cover.preview, true);
  modal = document.body.querySelector('[data-bili-frame-modal="cover"]');
  assert.ok(modal);
  assert.equal(modal.querySelector('img').getAttribute('src'), 'https://i0.hdslb.com/bfs/archive/cover.jpg');
  assert.equal(calls.length, 1);
  modal.querySelector('[data-bili-frame-modal-action="download"]').click();
  modal.querySelector('[data-bili-frame-modal-action="open"]').click();
  modal.querySelector('[data-bili-frame-modal-action="copy"]').click();
  assert.deepEqual(calls.map(([kind]) => kind), ['download', 'download', 'open', 'copy']);
  assert.match(
    modal.querySelector('[data-bili-frame-modal-feedback]').textContent,
    /封面地址/,
  );
  assert.ok(statuses.some((status) => status.message?.includes('预览')));
});

test('media actions keep input and adapter failures visible', () => {
  const { document } = createDom();
  const calls = [];
  const statuses = [];
  const video = { readyState: 1, videoWidth: 640, videoHeight: 360, currentTime: 2 };
  const actions = createMediaActions({
    document,
    video,
    pageUrl: 'https://www.bilibili.com/video/BV1',
    coverUrl: '',
    adapters: {
      download: () => { calls.push('download'); return false; },
      open: () => { calls.push('open'); return false; },
      copy: () => { calls.push('copy'); return false; },
    },
    onStatus: (status) => statuses.push(status),
  });
  assert.deepEqual(calls, []);
  assert.equal(actions.cover().reason, 'missing-cover');
  assert.equal(actions.capture().reason, 'unready-video');
  assert.equal(actions.copyTimestamp().reason, 'clipboard-failed');
  assert.equal(actions.cover('https://i.hdslb.com/a.jpg').ok, true);
  assert.deepEqual(calls, ['copy']);
  document.body
    .querySelector('[data-bili-frame-modal-action="open"]')
    .click();
  assert.deepEqual(calls, ['copy', 'open']);
  const failingCanvasActions = createMediaActions({
    video: { readyState: 4, videoWidth: 640, videoHeight: 360 },
    canvas: {
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => { throw new Error('tainted'); },
    },
    adapters: { download: () => false },
    onStatus: (status) => statuses.push(status),
  });
  assert.equal(failingCanvasActions.capture().reason, 'canvas-failed');
  assert.deepEqual(statuses.map((status) => status.reason).filter(Boolean), [
    'missing-cover', 'unready-video', 'clipboard-failed', 'open-failed', 'canvas-failed',
  ]);
});

test('lifecycle controller debounces, mounts once, handles SPA events and cleans up', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, duration: 2, currentTime: 1, clientWidth: 640, clientHeight: 360, pause() {} });
  fixture.videoWrap.appendChild(video);
  const listeners = new Map();
  let pending = null;
  let observerCallback = null;
  class TestObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() { observerCallback = null; }
  }
  const history = { pushState() {}, replaceState() {} };
  const root = {
    document: fixture.document,
    history,
    location: { href: 'https://www.bilibili.com/video/BV1' },
    MutationObserver: TestObserver,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    setTimeout: (callback) => { pending = callback; return 1; },
    clearTimeout: () => { pending = null; },
  };
  const controller = createLifecycleController(root, { debounceMs: 0 });
  controller.start();
  assert.equal(fixture.left.children.length, 1);
  pending();
  assert.equal(fixture.left.children.length, 5);
  const firstMount = controller.getMounted();
  observerCallback();
  pending();
  assert.deepEqual(controller.getMounted().controls, firstMount.controls);
  history.pushState({}, '', '#part');
  pending();
  assert.equal(fixture.left.children.length, 5);
  const eventTarget = { tagName: 'DIV', isContentEditable: false, closest: () => null };
  listeners.get('keydown')({ altKey: true, code: 'Comma', key: ',', target: eventTarget, preventDefault() {} });
  controller.destroy();
  assert.equal(observerCallback, null);
  assert.equal(history.__biliFrameLifecyclePatched, undefined);
  assert.equal(listeners.size, 0);
});

test('lifecycle keeps fullscreen control state synchronized across startup, mutations, and fullscreen events', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, duration: 2, currentTime: 1, clientWidth: 640, clientHeight: 360, pause() {} });
  fixture.videoWrap.appendChild(video);
  const harness = lifecycleHarness(fixture);
  harness.controller.start();
  harness.runTimer();
  const controls = harness.controller.getMounted().controls;
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === null));
  assert.equal(harness.getObserverOptions().attributes, true);
  assert.deepEqual(
    [...(harness.getObserverOptions().attributeFilter || [])].sort(),
    ['class', 'data-screen'],
  );

  fixture.player.className = 'bpx-player-container';
  fixture.player.setAttribute('data-screen', 'web');
  harness.getObserverCallback()([{ type: 'attributes', target: fixture.player, attributeName: 'data-screen' }]);
  harness.runTimer();
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === 'true'));

  fixture.player.setAttribute('data-screen', 'normal');
  fixture.document.dispatchEvent(new FakeEvent('fullscreenchange'));
  harness.runTimer();
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === null));

  fixture.document.webkitFullscreenElement = fixture.player;
  fixture.document.dispatchEvent(new FakeEvent('webkitfullscreenchange'));
  harness.runTimer();
  assert.ok(controls.every((control) => control.getAttribute('data-bili-frame-fullscreen') === 'true'));
  harness.controller.destroy();
  assert.equal((fixture.document.listeners.get('fullscreenchange') || []).length, 0);
  assert.equal((fixture.document.listeners.get('webkitfullscreenchange') || []).length, 0);
});

test('controls keep the native DOM layout and optically align inner icons to the native play glyph, not the control box', () => {
  const fixture = playerFixture();
  const first = ensureStyles(fixture.document);
  const second = ensureStyles(fixture.document);
  assert.equal(first, second);
  assert.equal(fixture.document.documentElement.querySelectorAll('#bili-frame-styles').length, 1);
  assert.match(first.textContent, /\.bili-frame-control/);
  const controlRule = first.textContent.match(/\.bili-frame-control\s*\{([^}]*)\}/s)?.[1] || '';
  // Native play controls are block-level, position-relative 22px rows. The
  // wrapper owns centering so fullscreen rules can resize the outer row while
  // preserving the same icon centerline as the native play button.
  assert.match(controlRule, /(?:^|;)\s*height\s*:\s*22px\s*(?:;|$)/);
  assert.match(controlRule, /(?:^|;)\s*display\s*:\s*block\s*(?:;|$)/);
  assert.match(controlRule, /(?:^|;)\s*position\s*:\s*relative\s*(?:;|$)/);
  assert.match(controlRule, /(?:^|;)\s*line-height\s*:\s*22px\s*(?:;|$)/);
  assert.doesNotMatch(controlRule, /(?:^|;)\s*(?:display\s*:\s*inline-flex|align-items|justify-content|align-self|transform|top|margin(?:-(?:top|bottom))?)\s*:/);
  const wrapperRule = first.textContent.match(/\.bili-frame-icon-wrap\s*\{([^}]*)\}/s)?.[1] || '';
  assert.match(wrapperRule, /(?:^|;)\s*width\s*:\s*100%\s*(?:;|$)/);
  assert.match(wrapperRule, /(?:^|;)\s*height\s*:\s*100%\s*(?:;|$)/);
  assert.match(wrapperRule, /(?:^|;)\s*display\s*:\s*flex\s*(?:;|$)/);
  assert.match(wrapperRule, /(?:^|;)\s*align-items\s*:\s*center\s*(?:;|$)/);
  assert.match(wrapperRule, /(?:^|;)\s*justify-content\s*:\s*center\s*(?:;|$)/);
  assert.match(wrapperRule, /(?:^|;)\s*line-height\s*:\s*0\s*(?:;|$)/);
  assert.doesNotMatch(wrapperRule, /(?:^|;)\s*transform\s*:/);
  const cssRules = [...first.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }));
  const iconRule = cssRules.find(({ selector }) => selector === '.bili-frame-icon')?.body || '';
  assert.match(iconRule, /(?:^|;)\s*width\s*:\s*22px\s*(?:;|$)/);
  assert.match(iconRule, /(?:^|;)\s*height\s*:\s*22px\s*(?:;|$)/);
  // Normal playback remains geometrically centered. The optical correction is
  // scoped to the two fullscreen modes below, so wide/mini layouts inherit no
  // vertical offset either.
  const opticalCorrection = iconRule.match(/(?:^|;)\s*transform\s*:\s*([^;}]*)/)?.[1].trim() || '';
  assert.equal(opticalCorrection, 'none');
  const fullscreenIconRules = cssRules.filter(({ body }) => /(?:^|;)\s*transform\s*:\s*translateY\(-5px\)\s*(?:;|$)/.test(body));
  assert.equal(fullscreenIconRules.length, 1);
  const fullscreenIconSelector = fullscreenIconRules[0].selector;
  assert.match(fullscreenIconSelector, /\.bili-frame-control\[data-bili-frame-fullscreen="true"\]\s+\.bili-frame-icon/);
  assert.doesNotMatch(fullscreenIconSelector, /\.bpx-player-container|:fullscreen|:-webkit-full-screen|mode-(?:webscreen|fullscreen)/);
  assert.doesNotMatch(fullscreenIconSelector, /@media|max-width|min-width|display-mode/);
  const narrowScreenRule = first.textContent.match(/@media\s*\(max-width:560px\)\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(narrowScreenRule, /\.bili-frame-icon\s*\{[^}]*transform\s*:/s);
  assert.match(first.textContent, /prefers-reduced-motion/);
  assert.match(first.textContent, /\.bili-frame-modal::backdrop/);
  assert.doesNotMatch(first.textContent, /(^|\n)\s*\.bpx-player/);
  const controls = mountControls(findPlayerAdapter(fixture.document), {}).controls;
  assert.ok(controls.every((control) => control.innerHTML.includes('<svg')));
});

test('interactive controls keep a transparent outer surface and highlight only the icon', () => {
  const fixture = playerFixture();
  const style = ensureStyles(fixture.document);
  const cssRules = [...style.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim(), body: match[2] }));
  const interactionStates = ['hover', 'focus-visible', 'active'];

  for (const state of interactionStates) {
    const controlRules = cssRules.filter(({ selector }) =>
      new RegExp(`\\.bili-frame-control:${state}(?:\\s|,|$)`).test(selector));
    assert.ok(controlRules.length > 0, `missing control :${state} rule`);
    assert.ok(
      controlRules.some(({ body }) => /(?:^|;)\s*background\s*:\s*transparent\s*(?:;|$)/.test(body)),
      `control :${state} must keep a transparent background`,
    );
    assert.ok(
      controlRules.every(({ body }) => !/background\s*:[^;}]*rgba\s*\(/i.test(body)),
      `control :${state} must not use an rgba background`,
    );
    assert.ok(
      controlRules.every(({ body }) => !/(?:^|;)\s*transform\s*:/.test(body)),
      `control :${state} must not alter the fullscreen transform`,
    );

    const iconRules = cssRules.filter(({ selector }) =>
      new RegExp(`\\.bili-frame-control:${state}[^{}]*\\.bili-frame-icon(?:\\s|,|$)`).test(selector));
    assert.ok(iconRules.length > 0, `missing descendant icon :${state} rule`);
    assert.ok(
      iconRules.some(({ body }) => /(?:^|;)\s*color\s*:\s*#00aeec\s*(?:;|$)/i.test(body)),
      `icon :${state} must use Bilibili blue`,
    );
    assert.ok(
      iconRules.some(({ body }) => /filter\s*:[^;}]*drop-shadow\s*\(/i.test(body)),
      `icon :${state} must have a drop-shadow highlight`,
    );
    assert.ok(
      iconRules.every(({ body }) => !/(?:^|;)\s*transform\s*:/.test(body)),
      `icon :${state} must not override the fullscreen transform`,
    );
  }

  const iconRule = cssRules.find(({ selector }) => selector === '.bili-frame-icon')?.body || '';
  assert.match(iconRule, /transition\s*:[^;}]*color[^;}]*filter/i);
});

test('lifecycle control clicks open visible frame and cover previews with default status', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, {
    readyState: 4,
    duration: 120,
    currentTime: 12.5,
    videoWidth: 640,
    videoHeight: 360,
    clientWidth: 640,
    clientHeight: 360,
    pause() {},
  });
  fixture.videoWrap.appendChild(video);
  const externalCalls = [];
  const harness = lifecycleHarness(fixture, {
    title: '生命周期测试',
    identity: 'BV1LIFE',
    coverUrl: 'https://i0.hdslb.com/bfs/archive/life.jpg@1200w',
    canvas: {
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => 'data:image/png;base64,lifecycle-frame',
    },
    adapters: {
      download: (details) => { externalCalls.push(['download', details]); return true; },
      open: (url) => { externalCalls.push(['open', url]); return true; },
      copy: (text) => { externalCalls.push(['copy', text]); return true; },
    },
  });

  harness.controller.ensure();
  const controls = harness.controller.getMounted().controls;
  controls[2].click();
  assert.ok(fixture.document.body.querySelector('[data-bili-frame-modal="frame"]'));
  assert.match(fixture.document.body.querySelector('.bili-frame-status').textContent, /预览/);
  assert.deepEqual(externalCalls, []);

  controls[3].click();
  const coverModal = fixture.document.body.querySelector('[data-bili-frame-modal="cover"]');
  assert.ok(coverModal);
  assert.equal(
    coverModal.querySelector('img').getAttribute('src'),
    'https://i0.hdslb.com/bfs/archive/life.jpg',
  );
  assert.deepEqual(externalCalls, []);
  harness.controller.destroy();
});

test('lifecycle image actions use explicitly captured userscript grants', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, {
    readyState: 4,
    duration: 120,
    currentTime: 12.5,
    videoWidth: 640,
    videoHeight: 360,
    clientWidth: 640,
    clientHeight: 360,
    pause() {},
  });
  fixture.videoWrap.appendChild(video);
  const calls = [];
  const harness = lifecycleHarness(fixture, {
    coverUrl: 'https://i0.hdslb.com/bfs/archive/grant.jpg',
    userscriptApis: {
      GM_download: (details) => calls.push(['download', details]),
      GM_openInTab: (url) => calls.push(['open', url]),
      GM_setClipboard: (text) => calls.push(['copy', text]),
    },
  });

  harness.controller.ensure();
  harness.controller.getMounted().controls[3].click();
  const modal = fixture.document.body.querySelector('[data-bili-frame-modal="cover"]');
  modal.querySelector('[data-bili-frame-modal-action="download"]').click();
  modal.querySelector('[data-bili-frame-modal-action="open"]').click();
  modal.querySelector('[data-bili-frame-modal-action="copy"]').click();
  assert.deepEqual(calls.map(([name]) => name), ['download', 'open', 'copy']);
  harness.controller.destroy();
});

function lifecycleHarness(fixture, options = {}) {
  const listeners = new Map();
  let pending = null;
  let timerCount = 0;
  let observerCallback = null;
  let observerOptions = null;
  class TestObserver {
    constructor(callback) { observerCallback = callback; }
    observe(_target, observeOptions) { observerOptions = observeOptions; }
    disconnect() { observerCallback = null; }
  }
  const history = { pushState() {}, replaceState() {} };
  const root = {
    document: fixture.document,
    history,
    location: { href: 'https://www.bilibili.com/video/BV1' },
    MutationObserver: options.MutationObserver || TestObserver,
    addEventListener: (type, listener) => {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    removeEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== listener));
    },
    setTimeout: (callback) => { timerCount += 1; pending = callback; return timerCount; },
    clearTimeout: () => { pending = null; },
  };
  const controller = createLifecycleController(root, { debounceMs: 0, ...options });
  return {
    controller,
    root,
    history,
    listeners,
    runTimer: () => { const callback = pending; pending = null; callback?.(); },
    getTimerCount: () => timerCount,
    getObserverCallback: () => observerCallback,
    getObserverOptions: () => observerOptions,
  };
}

test('lifecycle waits for documentElement/body/player to appear before mounting', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, clientWidth: 640, clientHeight: 360 });
  fixture.videoWrap.appendChild(video);
  const documentElement = fixture.document.documentElement;
  const body = fixture.document.body;
  fixture.document.removeChild(documentElement);
  fixture.document.documentElement = null;
  fixture.document.body = null;
  const harness = lifecycleHarness(fixture);
  harness.controller.start();
  harness.runTimer();
  assert.equal(harness.controller.getMounted(), null);
  fixture.document.documentElement = documentElement;
  fixture.document.body = body;
  fixture.document.appendChild(documentElement);
  harness.controller.schedule();
  harness.runTimer();
  assert.equal(fixture.left.children.length, 5);
});

test('one mutation burst and repeated schedules perform one debounced ensure', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, clientWidth: 640, clientHeight: 360 });
  fixture.videoWrap.appendChild(video);
  const harness = lifecycleHarness(fixture);
  harness.controller.start();
  harness.runTimer();
  const before = harness.getTimerCount();
  const observer = harness.getObserverCallback();
  observer();
  observer();
  observer();
  harness.controller.schedule();
  harness.controller.schedule();
  assert.ok(harness.getTimerCount() >= before + 5);
  harness.runTimer();
  assert.equal(fixture.left.children.length, 5);
});

test('same player repeated ensure keeps one control set and one control listener set', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, clientWidth: 640, clientHeight: 360 });
  fixture.videoWrap.appendChild(video);
  const harness = lifecycleHarness(fixture);
  harness.controller.ensure();
  const first = harness.controller.getMounted();
  harness.controller.schedule();
  harness.controller.ensure();
  const second = harness.controller.getMounted();
  assert.deepEqual(second.controls, first.controls);
  assert.equal(fixture.left.children.length, 5);
  assert.ok(second.controls.every((control) => control.listeners.get('click').length === 1));
});

test('player replacement mounts new controls and rebinds clock, cancelling old video callback', () => {
  const fixture = playerFixture();
  const oldVideo = Object.assign(fixture.document.createElement('video'), {
    readyState: 4, clientWidth: 640, clientHeight: 360,
  });
  const oldFrame = frameCallbackVideo();
  Object.assign(oldVideo, oldFrame);
  fixture.videoWrap.appendChild(oldVideo);
  const clock = createFrameClock();
  const harness = lifecycleHarness(fixture, { frameClock: clock });
  harness.controller.ensure();
  const oldCallback = oldVideo.pendingIds()[0];
  const replacement = playerFixture();
  const newVideo = Object.assign(replacement.document.createElement('video'), {
    readyState: 4, clientWidth: 1280, clientHeight: 720,
  });
  const newFrame = frameCallbackVideo();
  Object.assign(newVideo, newFrame);
  replacement.videoWrap.appendChild(newVideo);
  fixture.document.body.removeChild(fixture.player);
  fixture.document.body.appendChild(replacement.player);
  harness.controller.ensure();
  assert.equal(replacement.left.children.length, 5);
  assert.deepEqual(oldVideo.cancelled, [oldCallback]);
  assert.equal(clock.getVideo(), newVideo);
});

test('popstate, hashchange, pushState, and replaceState each schedule; history wraps once', () => {
  const fixture = playerFixture();
  const first = lifecycleHarness(fixture);
  const originalPush = first.history.pushState;
  first.controller.start();
  const second = lifecycleHarness(fixture);
  second.history = first.history;
  second.root.history = first.history;
  const secondController = createLifecycleController(second.root, { debounceMs: 0 });
  secondController.start();
  assert.equal(first.history.pushState, first.root.history.pushState);
  const before = first.getTimerCount();
  first.listeners.get('popstate')[0]();
  first.listeners.get('hashchange')[0]();
  first.history.pushState({}, '', '#one');
  first.history.replaceState({}, '', '#two');
  assert.equal(first.getTimerCount(), before + 4);
  assert.notEqual(first.history.pushState, originalPush);
  secondController.destroy();
  first.controller.destroy();
});

test('shortcuts step both directions, prevent default, and ignore editable or modified targets', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, duration: 1, currentTime: 0.5, clientWidth: 640, clientHeight: 360 });
  let pauses = 0;
  video.pause = () => { pauses += 1; };
  fixture.videoWrap.appendChild(video);
  const harness = lifecycleHarness(fixture);
  harness.controller.start();
  harness.runTimer();
  const target = { tagName: 'DIV', isContentEditable: false, closest: () => null };
  const dispatch = (code, extra = {}) => {
    let prevented = 0;
    harness.listeners.get('keydown')[0]({ altKey: true, code, key: code === 'Comma' ? ',' : '.', target, preventDefault: () => { prevented += 1; } , ...extra });
    return prevented;
  };
  assert.equal(dispatch('Comma'), 1);
  assert.equal(dispatch('Period'), 1);
  assert.equal(pauses, 2);
  const before = pauses;
  for (const blocked of [
    { tagName: 'INPUT' },
    { tagName: 'BUTTON' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'DIV', isContentEditable: false, closest: () => ({}) },
  ]) {
    assert.equal(dispatch('Comma', { target: blocked, ctrlKey: false }), 0);
  }
  assert.equal(dispatch('Comma', { ctrlKey: true }), 0);
  assert.equal(dispatch('Period', { metaKey: true }), 0);
  assert.equal(pauses, before);
});

test('unsupported pages and players without a video leave DOM unchanged', () => {
  const unsupported = playerFixture();
  unsupported.player.id = 'other-player';
  const unsupportedHarness = lifecycleHarness(unsupported);
  unsupportedHarness.controller.ensure();
  assert.equal(unsupported.left.children.length, 1);

  const noVideo = playerFixture();
  const noVideoHarness = lifecycleHarness(noVideo);
  noVideoHarness.controller.ensure();
  assert.equal(noVideo.left.children.length, 1);
});

test('destroy disconnects lifecycle resources and does not disable another controller', () => {
  const fixture = playerFixture();
  const video = fixture.document.createElement('video');
  Object.assign(video, { readyState: 4, clientWidth: 640, clientHeight: 360 });
  fixture.videoWrap.appendChild(video);
  const first = lifecycleHarness(fixture);
  first.controller.start();
  const second = lifecycleHarness(fixture);
  second.root.history = first.root.history;
  second.controller = createLifecycleController(second.root, { debounceMs: 0 });
  second.controller.start();
  const wrappedPush = first.root.history.pushState;
  first.controller.destroy();
  assert.equal(first.getObserverCallback(), null);
  assert.equal(first.listeners.get('keydown').length, 0);
  assert.equal(second.listeners.get('keydown').length, 1);
  assert.equal(second.root.history.pushState, wrappedPush);
  second.controller.destroy();
});
