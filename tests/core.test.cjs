'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTimestampUrl,
  buildFilenameFromTemplate,
  calculateStepTarget,
  estimateFrameDuration,
  formatTimestamp,
  isEditableTarget,
  normalizeCoverUrl,
  parseFrameRate,
  sanitizeFilename,
  shouldHandleShortcut,
} = require('../src/biliframe.user.js');

test('normalizeCoverUrl removes a Bilibili image-processing suffix', () => {
  assert.equal(
    normalizeCoverUrl('https://i2.hdslb.com/bfs/archive/hash.jpg@1200w_630h.webp'),
    'https://i2.hdslb.com/bfs/archive/hash.jpg',
  );
});

test('normalizeCoverUrl preserves query/hash and ordinary @ filenames', () => {
  assert.equal(
    normalizeCoverUrl('https://i0.hdslb.com/bfs/archive/cover.png@672w?token=abc#preview'),
    'https://i0.hdslb.com/bfs/archive/cover.png?token=abc#preview',
  );
  assert.equal(
    normalizeCoverUrl('https://example.com/images/user@2x.png'),
    'https://example.com/images/user@2x.png',
  );
});

test('normalizeCoverUrl accepts protocol-relative Bilibili URLs', () => {
  assert.equal(
    normalizeCoverUrl('//i1.hdslb.com/bfs/archive/hash.webp@672w_378h_1c.webp'),
    'https://i1.hdslb.com/bfs/archive/hash.webp',
  );
});

test('sanitizeFilename removes Windows-invalid characters and reserved names', () => {
  assert.equal(sanitizeFilename('  视频:<测试>/封面?.jpg  '), '视频_测试_封面_.jpg');
  assert.equal(sanitizeFilename('CON'), '_CON');
  assert.equal(sanitizeFilename('..'), 'BiliFrame');
});

test('sanitizeFilename keeps an extension while enforcing its maximum length', () => {
  const result = sanitizeFilename(`${'长'.repeat(160)}.png`, 40);
  assert.equal(result.length, 40);
  assert.ok(result.endsWith('.png'));
});

test('parseFrameRate handles decimal and rational values', () => {
  assert.equal(parseFrameRate(60), 60);
  assert.equal(parseFrameRate('59.940'), 59.94);
  assert.ok(Math.abs(parseFrameRate('30000/1001') - 29.97002997) < 1e-8);
  assert.equal(parseFrameRate('0/0'), null);
  assert.equal(parseFrameRate('not-a-rate'), null);
});

test('estimateFrameDuration rejects seek discontinuities and uses the median', () => {
  const duration = estimateFrameDuration([1 / 30, 1, 1 / 30, 1 / 60, -1]);
  assert.ok(Math.abs(duration - 1 / 30) < 1e-10);
});

test('estimateFrameDuration uses a valid hint, then the 30fps fallback', () => {
  assert.equal(estimateFrameDuration([], '60/1'), 1 / 60);
  assert.equal(estimateFrameDuration([], 'invalid'), 1 / 30);
});

test('calculateStepTarget pauses at media boundaries without overshooting', () => {
  assert.equal(calculateStepTarget(0.01, -1, 1 / 30, 100), 0);
  assert.equal(calculateStepTarget(99.99, 1, 1 / 30, 100), 100);
  assert.ok(Math.abs(calculateStepTarget(101, -1, 1 / 30, 100) - (100 - 1 / 30)) < 1e-10);
  assert.ok(Math.abs(calculateStepTarget(10, 1, 1 / 25, 100) - 10.04) < 1e-10);
});

test('formatTimestamp is stable for filenames and visible status text', () => {
  assert.equal(formatTimestamp(65.4321, '-'), '00-01-05-432');
  assert.equal(formatTimestamp(3661.007, ':'), '01:01:01:007');
  assert.equal(formatTimestamp(Number.NaN), '00-00-00-000');
});

test('buildTimestampUrl replaces t while preserving unrelated query and hash', () => {
  assert.equal(
    buildTimestampUrl('https://www.bilibili.com/video/BV123/?p=2&t=1#reply', 65.4321),
    'https://www.bilibili.com/video/BV123/?p=2&t=65.432#reply',
  );
});

test('filename templates preserve the default title-identity-extension convention', () => {
  assert.equal(
    buildFilenameFromTemplate(undefined, { title: '标题', identity: 'BV1ABC', kind: 'cover' }, 'jpg'),
    '标题 - BV1ABC.jpg',
  );
});

test('filename templates expand title, bvid/identity, timestamp, date, time, and kind', () => {
  assert.equal(
    buildFilenameFromTemplate(
      '{{title}}-{{bvid}}-{{timestamp}}-{{date}}-{{time}}-{{kind}}',
      {
        title: '测试视频', identity: 'BV1ABC', bvid: 'BV1ABC',
        timestamp: '00-00-12-500', date: '2024-01-02', time: '03-04-05', kind: 'frame',
      },
      'png',
    ),
    '测试视频-BV1ABC-00-00-12-500-2024-01-02-03-04-05-frame.png',
  );
});

test('filename templates derive local date and time from injected now when omitted', () => {
  const now = new Date(2024, 0, 2, 3, 4, 5, 6);
  assert.equal(
    buildFilenameFromTemplate('{{date}}-{{time}}', { now }, 'png'),
    '2024-01-02-03-04-05.png',
  );
  assert.match(
    buildFilenameFromTemplate('{{date}}-{{time}}', { now: 'not-a-date' }, 'png'),
    /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/,
  );
});

test('filename templates remove unknown placeholders instead of leaking template syntax', () => {
  assert.equal(
    buildFilenameFromTemplate('{{title}}-{{unknown}}-{{kind}}', { title: '标题', kind: 'cover' }, 'jpg'),
    '标题--cover.jpg',
  );
});

test('filename templates sanitize Windows names, fall back when empty, append one extension, and enforce maximum length', () => {
  assert.equal(
    buildFilenameFromTemplate('{{title}}', { title: 'CON<>:"/\\|?*' }, 'png'),
    '_CON_.png',
  );
  assert.equal(buildFilenameFromTemplate('{{unknown}}', {}, 'png'), 'BiliFrame.png');
  assert.equal(buildFilenameFromTemplate('{{title}}.png', { title: '标题' }, 'png'), '标题.png');
  const result = buildFilenameFromTemplate('{{title}}', { title: '长'.repeat(200) }, 'webp', 40);
  assert.equal(result.length, 40);
  assert.ok(result.endsWith('.webp'));
});

test('editable and interactive targets block global shortcuts', () => {
  const makeTarget = (tagName, options = {}) => ({
    tagName,
    isContentEditable: Boolean(options.editable),
    closest: (selector) => (options.closest && selector.includes(options.closest) ? {} : null),
  });

  assert.equal(isEditableTarget(makeTarget('INPUT')), true);
  assert.equal(isEditableTarget(makeTarget('DIV', { editable: true })), true);
  assert.equal(isEditableTarget(makeTarget('SPAN', { closest: 'button' })), true);
  assert.equal(isEditableTarget(makeTarget('DIV')), false);
});

test('only unmodified Alt+comma/period shortcuts are accepted', () => {
  const target = { tagName: 'DIV', isContentEditable: false, closest: () => null };
  assert.equal(
    shouldHandleShortcut({ altKey: true, code: 'Comma', key: ',', target }),
    true,
  );
  assert.equal(
    shouldHandleShortcut({ altKey: true, code: 'Period', key: '.', target }),
    true,
  );
  assert.equal(
    shouldHandleShortcut({ altKey: true, ctrlKey: true, code: 'Comma', target }),
    false,
  );
  assert.equal(
    shouldHandleShortcut({ altKey: true, code: 'Comma', target: { ...target, tagName: 'TEXTAREA' } }),
    false,
  );
});
