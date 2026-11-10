import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('public/pwa/privacy-notice.js', 'utf8');
function noticeRun(saved, blocked = false) {
  let accept;
  const writes = [];
  const events = [];
  const notice = {
    hidden: true,
    getAttribute: () => 'current-version',
    querySelector: () => ({
      addEventListener: (_event, fn) => {
        accept = fn;
      },
    }),
  };
  runInNewContext(source, {
    document: { querySelector: () => notice },
    localStorage: {
      getItem: () => {
        if (blocked) throw Error('blocked');
        return saved;
      },
      setItem: (...values) => {
        if (blocked) throw Error('blocked');
        writes.push(values);
      },
    },
    window: { dispatchEvent: (event) => events.push(event.type) },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
  });
  return { notice, writes, events, accept: () => accept() };
}
test('public welcome shows privacy before acknowledgment and remembers only an explicit click', () => {
  const run = noticeRun(null);
  expect(run.notice.hidden).toBe(false);
  expect(run.writes).toEqual([]);
  run.accept();
  expect(run.notice.hidden).toBe(true);
  expect(run.writes).toEqual([
    ['stampaix:privacy-notice-version', 'current-version'],
  ]);
  expect(run.events).toEqual(['stampaix:privacy-acknowledged']);
});
test('previous current acknowledgment stays dismissed; an old version and blocked storage still show', () => {
  expect(noticeRun('current-version').notice.hidden).toBe(true);
  expect(noticeRun('old-version').notice.hidden).toBe(false);
  const blocked = noticeRun(null, true);
  expect(blocked.notice.hidden).toBe(false);
  blocked.accept();
  expect(blocked.notice.hidden).toBe(true);
});
test('installation offer waits for the visible privacy notice, then becomes available without prompting', () => {
  let privacyVisible = true;
  let created = 0;
  const listeners = {};
  const element = () => ({
    style: {},
    setAttribute() {},
    addEventListener() {},
    append() {},
    remove() {},
  });
  runInNewContext(readFileSync('public/pwa/install.js', 'utf8'), {
    isSecureContext: true,
    location: { protocol: 'https:' },
    navigator: { standalone: false },
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    localStorage: { getItem: () => null },
    document: {
      readyState: 'complete',
      querySelector: () => (privacyVisible ? {} : null),
      body: { append() {} },
      createElement: () => {
        created++;
        return element();
      },
    },
  });
  expect(created).toBe(0);
  privacyVisible = false;
  listeners['stampaix:privacy-acknowledged']();
  expect(created).toBeGreaterThan(0);
});
