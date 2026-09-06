// ==UserScript==
// @name         BiliFrame - 哔哩哔哩逐帧与截图工具
// @namespace    https://github.com/Celesrain/biliframe
// @version      0.1.1
// @description  为哔哩哔哩播放器添加逐帧前进/后退、当前帧截图和原始封面查看下载功能。
// @author       Celesrain
// @license      MIT
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/medialist/play/*
// @match        https://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/festival/*
// @connect      hdslb.com
// @grant        GM_download
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(function startBiliFrame(root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  api.bootstrap(root);
})(typeof globalThis === 'object' ? globalThis : this, function createBiliFrame() {
  'use strict';

  const DEFAULT_FRAME_DURATION = 1 / 30;
  const MIN_FRAME_DURATION = 1 / 240;
  const MAX_FRAME_DURATION = 1 / 10;
  const DEFAULT_FILENAME = 'BiliFrame';
  const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

  function normalizeCoverUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') {
      return '';
    }

    const source = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();

    try {
      const url = new URL(source);
      url.pathname = url.pathname.replace(
        /(\.(?:avif|gif|jpe?g|png|webp))@[^/?#]+$/i,
        '$1',
      );
      return url.toString();
    } catch {
      return '';
    }
  }

  function sanitizeFilename(value, maximumLength = 120) {
    const safeMaximum = Number.isFinite(maximumLength)
      ? Math.max(12, Math.floor(maximumLength))
      : 120;
    let filename = String(value ?? '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[ .]+|[ .]+$/g, '');

    if (!filename || /^\.+$/.test(filename)) {
      return DEFAULT_FILENAME;
    }

    if (WINDOWS_RESERVED_NAME.test(filename)) {
      filename = `_${filename}`;
    }

    if (filename.length <= safeMaximum) {
      return filename;
    }

    const extensionMatch = filename.match(/(\.[a-z0-9]{1,10})$/i);
    const extension = extensionMatch?.[1] ?? '';
    const baseLength = safeMaximum - extension.length;
    const base = filename.slice(0, Math.max(1, baseLength)).replace(/[ .]+$/g, '');
    return `${base}${extension}`.slice(0, safeMaximum);
  }

  function parseFrameRate(value) {
    if (typeof value === 'string' && value.includes('/')) {
      const [numerator, denominator, ...rest] = value.split('/').map(Number);
      if (rest.length > 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
        return null;
      }
      value = denominator === 0 ? Number.NaN : numerator / denominator;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 240 ? parsed : null;
  }

  function estimateFrameDuration(samples, frameRateHint) {
    const plausibleSamples = Array.isArray(samples)
      ? samples
          .filter(
            (sample) =>
              Number.isFinite(sample) &&
              sample >= MIN_FRAME_DURATION &&
              sample <= MAX_FRAME_DURATION,
          )
          .sort((left, right) => left - right)
      : [];

    if (plausibleSamples.length > 0) {
      const middle = Math.floor(plausibleSamples.length / 2);
      if (plausibleSamples.length % 2 === 1) {
        return plausibleSamples[middle];
      }
      return (plausibleSamples[middle - 1] + plausibleSamples[middle]) / 2;
    }

    const parsedHint = parseFrameRate(frameRateHint);
    return parsedHint ? 1 / parsedHint : DEFAULT_FRAME_DURATION;
  }

  function calculateStepTarget(currentTime, direction, frameDuration, duration) {
    const maximum = Number.isFinite(duration) && duration >= 0 ? duration : Number.POSITIVE_INFINITY;
    const current = Number.isFinite(currentTime)
      ? Math.min(maximum, Math.max(0, currentTime))
      : 0;
    const normalizedDirection = direction < 0 ? -1 : 1;
    const step =
      Number.isFinite(frameDuration) && frameDuration > 0
        ? frameDuration
        : DEFAULT_FRAME_DURATION;
    return Math.min(maximum, Math.max(0, current + normalizedDirection * step));
  }

  function formatTimestamp(seconds, separator = '-') {
    const totalMilliseconds = Number.isFinite(seconds)
      ? Math.max(0, Math.round(seconds * 1000))
      : 0;
    const milliseconds = totalMilliseconds % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const second = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minute = totalMinutes % 60;
    const hour = Math.floor(totalMinutes / 60);
    return [hour, minute, second]
      .map((part) => String(part).padStart(2, '0'))
      .concat(String(milliseconds).padStart(3, '0'))
      .join(separator);
  }

  function buildTimestampUrl(pageUrl, seconds) {
    try {
      const url = new URL(pageUrl);
      const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      const formatted = safeSeconds.toFixed(3).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
      url.searchParams.set('t', formatted);
      return url.toString();
    } catch {
      return '';
    }
  }

  function isEditableTarget(target) {
    if (!target || typeof target !== 'object') {
      return false;
    }

    const tagName = String(target.tagName ?? '').toUpperCase();
    if (['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }

    return Boolean(
      target.closest?.(
        'a[href], button, input, select, textarea, [contenteditable="true"], [role="button"], [role="textbox"]',
      ),
    );
  }

  function shouldHandleShortcut(event) {
    const isFrameKey =
      event?.code === 'Comma' ||
      event?.code === 'Period' ||
      event?.key === ',' ||
      event?.key === '.';
    return Boolean(
      event?.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        isFrameKey &&
        !isEditableTarget(event.target),
    );
  }

  function isDescendant(node, ancestor) {
    let current = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parentNode;
    }
    return false;
  }

  function findPlayerAdapter(document) {
    if (!document?.querySelectorAll) return null;

    const players = document.querySelectorAll('#bilibili-player');
    for (const player of players) {
      const controlGroup =
        player.querySelector('.bpx-player-control-bottom') ||
        player.querySelector('.bilibili-player-video-control-bottom');
      if (!controlGroup) continue;

      const modernPlay = controlGroup.querySelector('[aria-label="播放/暂停"]');
      const legacyPlay =
        controlGroup.querySelector('[aria-label="播放"]') ||
        controlGroup.querySelector('.bilibili-player-video-btn-start');
      const playButton = modernPlay || legacyPlay;
      if (!playButton || !isDescendant(playButton, controlGroup)) continue;

      return { player, controlGroup, playButton };
    }
    return null;
  }

  function chooseActiveVideo(player) {
    if (!player?.querySelectorAll) return null;

    const candidates = player.querySelectorAll('video');
    let selected = null;
    let selectedArea = -1;
    for (const video of candidates) {
      if (!video.isConnected || video.hidden || video.readyState < 2) continue;
      if (video.style?.display === 'none' || video.style?.visibility === 'hidden') continue;
      if (!isDescendant(video, player)) continue;

      const rect = video.getBoundingClientRect?.();
      const width = Number(rect?.width ?? video.clientWidth) || 0;
      const height = Number(rect?.height ?? video.clientHeight) || 0;
      const area = Math.max(0, width) * Math.max(0, height);
      if (area > selectedArea) {
        selected = video;
        selectedArea = area;
      }
    }
    return selected;
  }

  function mountControls(adapter, actions = {}) {
    if (!adapter?.playButton?.parentNode || !adapter.controlGroup) {
      return { controls: [] };
    }

    const host = adapter.playButton.parentNode;
    const existing = host.querySelectorAll?.('[data-bili-frame-control]') || [];
    if (existing.length === 4) {
      return { controls: Array.from(existing) };
    }

    const definitions = [
      ['previous', '上一帧', 'Alt+,', '<path d="M16.5 3.5 7 12l9.5 8.5"/><path d="M7 12h14"/>'],
      ['next', '下一帧', 'Alt+.', '<path d="m7.5 3.5 9.5 8.5-9.5 8.5"/><path d="M17 12H3"/>'],
      ['capture', '截取当前画面', '', '<rect x="2.5" y="5" width="19" height="16.5" rx="2.5"/><circle cx="12" cy="13" r="4"/><path d="M7 5 9 2.5h6L17 5"/>'],
      ['cover', '查看视频封面', '', '<rect x="2.5" y="2.5" width="19" height="19" rx="2.5"/><circle cx="8.5" cy="8.5" r="2"/><path d="m3.5 18 5-5 3.5 3.5 2.5-2.5 6 5"/>'],
    ];
    const controls = definitions.map(([actionName, label, shortcut, icon]) => {
      const control = host.ownerDocument.createElement('button');
      control.className = `bpx-player-ctrl-btn bili-frame-control bili-frame-${actionName}`;
      control.setAttribute('type', 'button');
      control.setAttribute('data-bili-frame-control', actionName);
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', '0');
      control.setAttribute('aria-label', label);
      control.setAttribute('title', shortcut ? `${label}（${shortcut}）` : label);
      control.innerHTML = `<svg class="bili-frame-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;

      const invoke = (event) => {
        event.stopPropagation();
        if (typeof actions[actionName] === 'function') {
          actions[actionName](control, event);
        } else if (typeof actions[actionName] === 'number') {
          actions[actionName] += 1;
        }
      };
      control.addEventListener('click', invoke);
      control.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          invoke(event);
        }
      });
      return control;
    });

    let reference = adapter.playButton.nextSibling || null;
    controls.forEach((control) => {
      host.insertBefore(control, reference);
      reference = control.nextSibling || null;
    });
    return { controls };
  }

  function createFrameClock(options = {}) {
    const maxSamples = Number.isFinite(options.maxSamples)
      ? Math.max(2, Math.floor(options.maxSamples))
      : 12;
    let video = null;
    let callbackId = null;
    let lastMediaTime = null;
    let samples = [];
    let frameRateHint = options.frameRateHint;

    const schedule = () => {
      if (!video || typeof video.requestVideoFrameCallback !== 'function') return;
      callbackId = video.requestVideoFrameCallback((_now, metadata = {}) => {
        callbackId = null;
        const mediaTime = Number(metadata.mediaTime);
        if (Number.isFinite(mediaTime) && Number.isFinite(lastMediaTime)) {
          const delta = mediaTime - lastMediaTime;
          if (delta >= MIN_FRAME_DURATION && delta <= MAX_FRAME_DURATION) {
            samples.push(delta);
            if (samples.length > maxSamples) samples.shift();
          }
        }
        if (Number.isFinite(mediaTime)) lastMediaTime = mediaTime;
        schedule();
      });
    };

    const unbind = () => {
      if (video && callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(callbackId);
      }
      video = null;
      callbackId = null;
      lastMediaTime = null;
      samples = [];
    };

    const bind = (nextVideo) => {
      if (nextVideo === video) return;
      unbind();
      if (!nextVideo) return;
      video = nextVideo;
      frameRateHint = options.frameRateHint ?? nextVideo.frameRate ?? nextVideo.videoFrameRate;
      schedule();
    };

    return {
      bind,
      unbind,
      getFrameDuration: () => estimateFrameDuration(samples, frameRateHint),
      getFps: () => 1 / estimateFrameDuration(samples, frameRateHint),
      getSamples: () => samples.slice(),
      getVideo: () => video,
    };
  }

  function createFrameStepAction(videoOrGetter, options = {}) {
    const getVideo = typeof videoOrGetter === 'function'
      ? videoOrGetter
      : () => videoOrGetter;
    const clock = options.clock || createFrameClock(options);
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};

    const step = (direction) => {
      const video = getVideo();
      if (!video) return null;
      clock.bind(video);
      if (typeof video.pause === 'function') video.pause();
      const target = calculateStepTarget(
        video.currentTime,
        direction,
        clock.getFrameDuration(),
        video.duration,
      );
      video.currentTime = target;
      const status = {
        direction: direction < 0 ? -1 : 1,
        time: target,
        fps: clock.getFps(),
      };
      report(status);
      return status;
    };
    step.previous = () => step(-1);
    step.next = () => step(1);
    step.clock = clock;
    return step;
  }

  function resolveCoverUrl(document) {
    if (!document?.querySelectorAll) return '';
    const candidates = [
      ['meta[property="og:image"]', 'content'],
      ['meta[itemprop="image"]', 'content'],
      ['link[rel="image_src"]', 'href'],
    ];
    for (const [selector, attribute] of candidates) {
      for (const element of document.querySelectorAll(selector)) {
        const url = normalizeCoverUrl(element.getAttribute(attribute));
        if (url) return url;
      }
    }
    for (const image of document.querySelectorAll('img')) {
      if (image.hidden || image.style?.display === 'none' || image.style?.visibility === 'hidden') {
        continue;
      }
      const url = normalizeCoverUrl(image.getAttribute('src'));
      if (url) return url;
    }
    return '';
  }

  const coverModalStates = new WeakMap();

  function createCoverModal(document, coverOrOptions = {}, injectedActions = {}) {
    const options = typeof coverOrOptions === 'string'
      ? { coverUrl: coverOrOptions, actions: injectedActions }
      : (coverOrOptions || {});
    const actions = options.actions || injectedActions || {};
    let state = coverModalStates.get(document);

    const close = () => {
      if (!state?.modal) return;
      const opener = state.opener;
      if (state.modal.parentNode) state.modal.parentNode.removeChild(state.modal);
      state.modal = null;
      state.opener = null;
      if (typeof opener?.focus === 'function') opener.focus();
    };

    const open = (nextCoverUrl = options.coverUrl || options.url, opener = options.opener) => {
      const kind = options.kind === 'frame' ? 'frame' : 'cover';
      const coverUrl = kind === 'cover'
        ? normalizeCoverUrl(nextCoverUrl)
        : String(nextCoverUrl || '');
      if (!coverUrl || !document?.body) return null;
      if (state?.modal) close();

      const modal = document.createElement('div');
      modal.className = 'bili-frame-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute(
        'aria-label',
        options.dialogLabel || (kind === 'frame' ? 'BiliFrame 当前画面预览' : 'BiliFrame 视频封面预览'),
      );
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('tabindex', '-1');
      modal.setAttribute('data-bili-frame-modal', kind);
      const image = document.createElement('img');
      image.className = 'bili-frame-modal-image';
      image.setAttribute('src', coverUrl);
      image.setAttribute('alt', options.alt || (kind === 'frame' ? '截取的当前画面' : '视频原始封面'));
      const extension = coverUrl.match(/\.([a-z0-9]{1,10})(?:[?#]|$)/i)?.[1] || 'jpg';
      const filename = options.filename
        ? sanitizeFilename(options.filename)
        : sanitizeFilename(`${options.title || DEFAULT_FILENAME}.${extension}`);
      const filenameNode = document.createElement('div');
      filenameNode.className = 'bili-frame-modal-filename';
      filenameNode.setAttribute('data-bili-frame-modal-filename', 'true');
      filenameNode.textContent = filename;
      const content = document.createElement('div');
      content.className = 'bili-frame-modal-content';
      content.append(image, filenameNode);

      const makeAction = (name, label, callback) => {
        const button = document.createElement('button');
        button.className = `bili-frame-modal-action bili-frame-modal-${name}`;
        button.setAttribute('type', 'button');
        button.setAttribute('data-bili-frame-modal-action', name);
        button.setAttribute('aria-label', label);
        button.textContent = label;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (name === 'close') {
            close();
          } else if (typeof callback === 'function') {
            callback(coverUrl, filename);
          }
        });
        return button;
      };
      const buttons = document.createElement('div');
      buttons.className = 'bili-frame-modal-actions';
      const actionItems = Array.isArray(options.actionItems)
        ? options.actionItems
        : [
            { name: 'download', label: '下载原图', callback: actions.download },
            { name: 'open', label: '打开原图', callback: actions.open },
            { name: 'copy', label: '复制图片地址', callback: actions.copy },
          ];
      buttons.append(
        ...actionItems.map((item) => makeAction(item.name, item.label, item.callback)),
        makeAction('close', '关闭', null),
      );
      modal.append(content, buttons);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
      });
      modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' || event.code === 'Escape') close();
      });
      state = { modal, opener };
      coverModalStates.set(document, state);
      document.body.appendChild(modal);
      buttons.querySelector?.('[data-bili-frame-modal-action]')?.focus?.();
      return modal;
    };

    return { open, close, getModal: () => state?.modal || null };
  }

  function createUserscriptAdapters(root = {}) {
    const call = (name, args) => {
      if (typeof root[name] !== 'function') return false;
      try {
        root[name](...args);
        return true;
      } catch {
        return false;
      }
    };
    return {
      download: (details) => call('GM_download', [details]),
      open: (url) => call('GM_openInTab', [url]),
      copy: (text) => call('GM_setClipboard', [text]),
    };
  }

  function buildCoverFilename(titleOrOptions, identity, coverUrl) {
    const options = titleOrOptions && typeof titleOrOptions === 'object'
      ? titleOrOptions
      : { title: titleOrOptions, identity, coverUrl };
    const title = options.title || 'BiliFrame';
    const id = options.identity || options.bvid || options.episode || '';
    const url = options.coverUrl || options.url || '';
    const extension = String(url).match(/\.([a-z0-9]{1,10})(?:[?#@]|$)/i)?.[1] || 'png';
    return sanitizeFilename([title, id].filter(Boolean).join(' - ') + `.${extension}`);
  }

  function captureCurrentFrame(video, options = {}) {
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      const status = {
        ok: false,
        reason: 'unready-video',
        message: '视频画面尚未准备好，请稍后重试',
      };
      report(status);
      return status;
    }
    try {
      const document = options.document || video.ownerDocument;
      const canvas = options.canvas || document?.createElement?.('canvas');
      if (!canvas) throw new Error('canvas unavailable');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const filename = options.filename || buildCoverFilename({
        title: options.title,
        identity: options.identity,
        coverUrl: '.png',
      });
      const status = {
        ok: true,
        type: 'frame-captured',
        dataUrl,
        filename,
        message: '已截取当前画面',
      };
      report(status);
      return status;
    } catch {
      const status = {
        ok: false,
        reason: 'canvas-failed',
        message: '截图失败，视频源或浏览器可能禁止画布导出',
      };
      report(status);
      return status;
    }
  }

  function copyTimestampLink(pageUrl, seconds, adapters, onStatus) {
    const report = typeof onStatus === 'function' ? onStatus : () => {};
    const url = buildTimestampUrl(pageUrl, seconds);
    if (!url || !adapters?.copy?.(url)) {
      const status = { ok: false, reason: 'clipboard-failed', url };
      report(status);
      return status;
    }
    const status = { ok: true, url, message: '已复制当前时间链接' };
    report(status);
    return status;
  }

  function createMediaActions(options = {}) {
    const adapters = options.adapters || createUserscriptAdapters(options.root);
    const getVideo = () => options.getVideo?.() || options.video;
    const getDocument = () => options.document || getVideo()?.ownerDocument;
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};

    const adapterAction = (name, argument, successMessage, failureReason) => {
      const ok = Boolean(adapters[name]?.(argument));
      const status = ok
        ? { ok: true, type: name, message: successMessage }
        : { ok: false, reason: failureReason, message: `无法完成：${successMessage}` };
      report(status);
      return status;
    };

    const copyTimestamp = () => copyTimestampLink(
      options.pageUrl,
      getVideo()?.currentTime ?? options.seconds,
      adapters,
      report,
    );

    return {
      capture: (opener) => {
        const result = captureCurrentFrame(getVideo(), {
          ...options,
          adapters: undefined,
          onStatus: undefined,
        });
        if (!result.ok) {
          report(result);
          return result;
        }
        const modalApi = createCoverModal(getDocument(), {
          kind: 'frame',
          filename: result.filename,
          actionItems: [
            {
              name: 'download',
              label: '下载截图',
              callback: (url, filename) => adapterAction(
                'download',
                { url, name: filename, saveAs: true },
                '已请求下载截图',
                'download-failed',
              ),
            },
            {
              name: 'copy-time',
              label: '复制当前时间链接',
              callback: copyTimestamp,
            },
          ],
        });
        const modal = modalApi.open(result.dataUrl, opener);
        if (!modal) {
          const status = { ok: false, reason: 'preview-failed', message: '无法显示截图预览' };
          report(status);
          return status;
        }
        const status = {
          ...result,
          preview: true,
          message: '已截取当前画面，可在预览中查看或下载',
        };
        report(status);
        return status;
      },
      copyTimestamp,
      cover: (urlOrOpener) => {
        const explicitUrl = typeof urlOrOpener === 'string' ? urlOrOpener : '';
        const opener = explicitUrl ? options.opener : urlOrOpener;
        const document = getDocument();
        const url = normalizeCoverUrl(
          explicitUrl || options.coverUrl || resolveCoverUrl(document),
        );
        if (!url) {
          const status = { ok: false, reason: 'missing-cover', message: '未找到视频封面' };
          report(status);
          return status;
        }
        const filename = buildCoverFilename({
          title: options.title,
          identity: options.identity,
          coverUrl: url,
        });
        const modalApi = createCoverModal(document, {
          kind: 'cover',
          title: options.title,
          filename,
          actions: {
            download: (imageUrl, imageFilename) => adapterAction(
              'download',
              { url: imageUrl, name: imageFilename, saveAs: true },
              '已请求下载视频封面',
              'download-failed',
            ),
            open: (imageUrl) => adapterAction(
              'open', imageUrl, '已打开视频封面', 'open-failed',
            ),
            copy: (imageUrl) => adapterAction(
              'copy', imageUrl, '已复制封面地址', 'clipboard-failed',
            ),
          },
        });
        const modal = modalApi.open(url, opener);
        if (!modal) {
          const status = { ok: false, reason: 'preview-failed', message: '无法显示封面预览' };
          report(status);
          return status;
        }
        const status = {
          ok: true,
          type: 'cover-preview',
          preview: true,
          url,
          message: '已打开视频封面预览',
        };
        report(status);
        return status;
      },
    };
  }

  function ensureStyles(document) {
    if (!document?.head && !document?.documentElement) return null;
    const root = document.head || document.documentElement;
    const existing = document.querySelector?.('#bili-frame-styles');
    if (existing) return existing;
    const style = document.createElement('style');
    style.id = 'bili-frame-styles';
    style.textContent = `
.bili-frame-control { width:36px; height:22px; min-width:30px; padding:0; border:0; background:transparent; color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color .15s ease,opacity .15s ease; }
.bili-frame-control:hover, .bili-frame-control:focus-visible { background:rgba(255,255,255,.16); outline:none; }
.bili-frame-control:disabled { opacity:.45; cursor:default; }
.bili-frame-icon { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:2.35; stroke-linecap:round; stroke-linejoin:round; pointer-events:none; }
.bili-frame-status { position:fixed; z-index:2147483646; right:16px; bottom:64px; max-width: min(360px, calc(100vw - 32px)); padding:6px 10px; border-radius:999px; color:#fff; background:rgba(20,20,24,.88); font:12px/1.4 sans-serif; pointer-events:none; }
.bili-frame-status-success { background:rgba(24,120,70,.92); } .bili-frame-status-error { background:rgba(170,45,45,.94); }
.bili-frame-modal { position:fixed; inset:0; z-index:2147483645; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; background:rgba(0,0,0,.72); color:#fff; }
.bili-frame-modal-content { max-width:min(92vw,1200px); max-height:82vh; overflow:auto; text-align:center; background:rgba(24,24,28,.96); padding:16px; border-radius:8px; }
.bili-frame-modal-image { display:block; max-width:100%; max-height:68vh; object-fit:contain; }
.bili-frame-modal-filename { margin-top:8px; overflow-wrap:anywhere; } .bili-frame-modal-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:12px; padding:10px 12px; border-radius:8px; background:rgba(24,24,28,.96); }
.bili-frame-modal-action { min-height:32px; padding:6px 12px; border:1px solid rgba(255,255,255,.35); border-radius:4px; color:#fff; background:rgba(255,255,255,.1); cursor:pointer; }
.bili-frame-modal-action:hover, .bili-frame-modal-action:focus-visible { background:rgba(255,255,255,.22); outline:2px solid currentColor; outline-offset:2px; }
@media (max-width:560px) { .bili-frame-control { width:30px; min-width:30px; } .bili-frame-icon { width:20px; height:20px; } .bili-frame-modal { padding:12px; } }
@media (prefers-reduced-motion: reduce) { .bili-frame-control { transition:none; } }
@media (min-width:900px) { .bili-frame-modal-content { max-width:min(80vw,1400px); } }
@media (display-mode: fullscreen) { .bili-frame-status { bottom:80px; } }
`;
    root.appendChild(style);
    return style;
  }

  function createStatusPresenter(document, options = {}) {
    let node = null;
    let timer = null;
    const show = (status) => {
      if (!document?.body) return null;
      if (!node) {
        node = document.createElement('div');
        node.className = 'bili-frame-status';
        node.setAttribute('role', 'status');
        document.body.appendChild(node);
      }
      const success = status?.ok !== false;
      node.className = `bili-frame-status ${success ? 'bili-frame-status-success' : 'bili-frame-status-error'}`;
      node.textContent = status?.message || (success ? 'BiliFrame 操作完成' : 'BiliFrame 操作失败');
      const cancelTimer = options.clearTimeout || clearTimeout;
      const startTimer = options.setTimeout || setTimeout;
      if (timer !== null) cancelTimer(timer);
      timer = startTimer(() => { if (node) node.hidden = true; }, options.duration ?? 3200);
      node.hidden = false;
      return node;
    };
    return { show, getNode: () => node };
  }

  const lifecycleHistoryStates = new WeakMap();

  function releaseHistory(history, subscriber) {
    const state = lifecycleHistoryStates.get(history);
    if (!state) return;
    state.subscribers.delete(subscriber);
    if (state.subscribers.size > 0) return;
    for (const [name, original] of Object.entries(state.originals)) history[name] = original;
    delete history.__biliFrameLifecyclePatched;
    lifecycleHistoryStates.delete(history);
  }

  function createLifecycleController(root = {}, options = {}) {
    const document = root.document;
    const observerFactory = options.MutationObserver || root.MutationObserver;
    const frameClock = options.frameClock || createFrameClock();
    const delay = Number.isFinite(options.debounceMs) ? options.debounceMs : 50;
    let observer = null;
    let timer = null;
    let activeVideo = null;
    let mounted = null;
    let started = false;
    let destroyed = false;
    let historyRestore = null;
    const statusPresenter = options.statusPresenter || createStatusPresenter(document, {
      setTimeout: root.setTimeout,
      clearTimeout: root.clearTimeout,
    });
    const reportStatus = typeof options.onStatus === 'function'
      ? options.onStatus
      : statusPresenter.show;

    const schedule = () => {
      if (destroyed) return;
      if (timer !== null) (root.clearTimeout || clearTimeout)(timer);
      timer = (root.setTimeout || setTimeout)(() => {
        timer = null;
        ensure();
      }, delay);
    };

    const ensure = () => {
      if (destroyed || !document?.documentElement || !document.body) return null;
      ensureStyles(document);
      const adapter = findPlayerAdapter(document);
      if (!adapter) return null;
      const video = chooseActiveVideo(adapter.player);
      if (!video) return null;
      if (video !== activeVideo) {
        activeVideo = video;
        frameClock.bind(video);
      }
      const mediaActions = createMediaActions({
        ...options,
        adapters: options.adapters || createUserscriptAdapters(root),
        document,
        video,
        pageUrl: options.pageUrl || root.location?.href || '',
        title: options.title || document.title || DEFAULT_FILENAME,
        identity: options.identity || root.location?.pathname?.match(/(?:BV[\w]+|ep\d+)/i)?.[0] || '',
        onStatus: reportStatus,
      });
      mounted = mountControls(adapter, {
        previous: stepAction.previous,
        next: stepAction.next,
        capture: mediaActions.capture,
        cover: mediaActions.cover,
      });
      return mounted;
    };

    const stepAction = createFrameStepAction(() => activeVideo, {
      clock: frameClock,
      onStatus: (status) => reportStatus({
        ...status,
        ok: true,
        message: `${status.direction < 0 ? '上一帧' : '下一帧'}：${formatTimestamp(status.time, ':')}（约 ${status.fps.toFixed(2)} FPS）`,
      }),
    });

    const onShortcut = (event) => {
      if (!shouldHandleShortcut(event)) return;
      event.preventDefault();
      if (event.code === 'Comma' || event.key === ',') stepAction.previous();
      else stepAction.next();
    };

    const patchHistory = () => {
      const history = root.history;
      if (!history) return;
      const current = lifecycleHistoryStates.get(history);
      if (current) {
        current.subscribers.add(schedule);
        historyRestore = () => releaseHistory(history, schedule);
        return;
      }
      if (history.__biliFrameLifecyclePatched) return;
      const originals = {};
      const subscribers = new Set([schedule]);
      for (const name of ['pushState', 'replaceState']) {
        if (typeof history[name] !== 'function') continue;
        originals[name] = history[name];
        history[name] = function patchedHistory(...args) {
          const result = originals[name].apply(this, args);
          subscribers.forEach((subscriber) => subscriber());
          return result;
        };
      }
      history.__biliFrameLifecyclePatched = true;
      lifecycleHistoryStates.set(history, { originals, subscribers });
      historyRestore = () => releaseHistory(history, schedule);
    };

    const start = () => {
      if (started || destroyed) return;
      started = true;
      if (root.addEventListener) {
        root.addEventListener('popstate', schedule);
        root.addEventListener('hashchange', schedule);
        root.addEventListener('keydown', onShortcut);
      }
      patchHistory();
      if (observerFactory) {
        observer = new observerFactory(() => schedule());
        observer.observe(document?.documentElement || document, { childList: true, subtree: true });
      }
      schedule();
    };

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      if (timer !== null) (root.clearTimeout || clearTimeout)(timer);
      if (observer?.disconnect) observer.disconnect();
      if (root.removeEventListener) {
        root.removeEventListener('popstate', schedule);
        root.removeEventListener('hashchange', schedule);
        root.removeEventListener('keydown', onShortcut);
      }
      historyRestore?.();
      frameClock.unbind();
      activeVideo = null;
      mounted = null;
    };

    return { start, schedule, ensure, destroy, getMounted: () => mounted, getActiveVideo: () => activeVideo };
  }

  function bootstrap() {
    const controller = createLifecycleController(arguments[0]);
    controller.start();
    return controller;
  }

  return {
    bootstrap,
    buildTimestampUrl,
    calculateStepTarget,
    chooseActiveVideo,
    createFrameClock,
    createCoverModal,
    createFrameStepAction,
    createMediaActions,
    createLifecycleController,
    createStatusPresenter,
    createUserscriptAdapters,
    buildCoverFilename,
    captureCurrentFrame,
    copyTimestampLink,
    estimateFrameDuration,
    formatTimestamp,
    findPlayerAdapter,
    isEditableTarget,
    mountControls,
    normalizeCoverUrl,
    parseFrameRate,
    resolveCoverUrl,
    ensureStyles,
    sanitizeFilename,
    shouldHandleShortcut,
  };
});
