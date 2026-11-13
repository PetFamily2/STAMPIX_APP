import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Transpiler } from 'bun';
import { isAppleMobile } from '../web-permissions/browserPermissions';

function runtime() {
  const handlers = new Map();
  const cleanup = [];
  let standalone = false;
  const context = {
    isAppleMobile,
    navigator: { userAgent: 'Android Chrome', maxTouchPoints: 5 },
    window: {
      matchMedia: () => ({ matches: standalone }),
      addEventListener: (name, callback) => handlers.set(name, callback),
      removeEventListener: (name) => handlers.delete(name),
    },
    useSyncExternalStore: (subscribe, snapshot) => {
      cleanup.push(subscribe(() => {}));
      return snapshot();
    },
  };
  const source = readFileSync('lib/web-permissions/installPrompt.ts', 'utf8')
    .replace(/^import[^;]+;\s*/gm, '')
    .replace(/^export /gm, '');
  const js = new Transpiler({ loader: 'ts' }).transformSync(
    `${source}\nglobalThis.api = { useWebInstall, requestWebInstall, snapshot: () => snapshot };`
  );
  runInNewContext(js, context);
  return {
    api: context.api,
    handlers,
    cleanup,
    setInstalled: () => {
      standalone = true;
    },
  };
}

describe('real browser installation event lifecycle without real installs', () => {
  test('subscription captures an offer but never opens an installation prompt', async () => {
    const { api, handlers, cleanup } = runtime();
    let prompts = 0;
    let prevented = 0;
    api.useWebInstall();
    handlers.get('beforeinstallprompt')({
      preventDefault: () => prevented++,
      prompt: async () => prompts++,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    expect(prevented).toBe(1);
    expect(prompts).toBe(0);
    expect(api.snapshot().available).toBe(true);
    expect(await api.requestWebInstall()).toBe('accepted');
    expect(prompts).toBe(1);
    expect(api.snapshot().installed).toBe(false);
    expect(await api.requestWebInstall()).toBe('unavailable');
    cleanup.forEach((close) => {
      close();
    });
    expect(handlers.size).toBe(0);
  });
  test('dismissed prompts are not retried automatically and appinstalled clears the offer', async () => {
    const { api, handlers, setInstalled } = runtime();
    api.useWebInstall();
    handlers.get('beforeinstallprompt')({
      preventDefault: () => {},
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    expect(await api.requestWebInstall()).toBe('dismissed');
    expect(api.snapshot().available).toBe(false);
    setInstalled();
    handlers.get('appinstalled')();
    expect(api.snapshot().installed).toBe(true);
    expect(api.snapshot().available).toBe(false);
  });
  test('double clicks share no prompt and a rejected prompt does not poison later offers', async () => {
    const { api, handlers } = runtime();
    api.useWebInstall();
    let release;
    handlers.get('beforeinstallprompt')({
      preventDefault: () => {},
      prompt: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    const first = api.requestWebInstall();
    expect(await api.requestWebInstall()).toBe('unavailable');
    release();
    expect(await first).toBe('accepted');
    handlers.get('beforeinstallprompt')({
      preventDefault: () => {},
      prompt: async () => {
        throw Error('browser rejected');
      },
    });
    await expect(api.requestWebInstall()).rejects.toThrow('browser rejected');
    expect(await api.requestWebInstall()).toBe('unavailable');
  });
});
