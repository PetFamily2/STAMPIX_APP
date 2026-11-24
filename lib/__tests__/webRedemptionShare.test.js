import { expect, test } from 'bun:test';
import { shareRedemptionImage } from '../webRedemptionShare';

const image = 'data:image/png;base64,iVBORw0KGgo=';
function setup(overrides = {}) {
  const calls = [];
  return {
    calls,
    input: {
      valid: () => true,
      authorize: async () => true,
      capture: async () => {
        calls.push('capture');
        return image;
      },
      canShare: () => false,
      share: async (file) => {
        calls.push(['share', file]);
      },
      download: (file) => {
        calls.push(['download', file]);
      },
      ...overrides,
    },
  };
}
test('desktop download contains a bounded PNG file and is distinct from successful sharing', async () => {
  const { input, calls } = setup();
  expect(await shareRedemptionImage(input)).toEqual({ status: 'downloaded' });
  expect(calls[0]).toBe('capture');
  expect(calls[1][0]).toBe('download');
  expect(calls[1][1].name).toBe('stampaix-reward.png');
  expect(calls[1][1].type).toBe('image/png');
  expect(calls[1][1].size).toBe(8);
});
test('supported file sharing has no automatic download', async () => {
  const { input, calls } = setup({ canShare: () => true });
  expect(await shareRedemptionImage(input)).toEqual({ status: 'shared' });
  expect(calls[1][0]).toBe('share');
  expect(calls.length).toBe(2);
});
test('denied or failed receipt authorization never captures', async () => {
  for (const authorize of [
    async () => false,
    async () => {
      throw new Error('denied');
    },
  ]) {
    const { input, calls } = setup({ authorize });
    expect(await shareRedemptionImage(input)).toEqual({ status: 'ignored' });
    expect(calls).toEqual([]);
  }
});
test('scope invalidation after auth or capture prevents delivery', async () => {
  for (const phase of ['authorize', 'capture']) {
    let valid = true;
    const { input, calls } = setup({ valid: () => valid });
    input[phase] = async () => {
      valid = false;
      return phase === 'capture' ? image : true;
    };
    expect(await shareRedemptionImage(input)).toEqual({ status: 'ignored' });
    expect(calls).toEqual([]);
  }
});
test('invalid, oversized or failed capture cannot deliver a file', async () => {
  for (const capture of [
    async () => 'data:text/html;base64,PGgxPg==',
    async () => 'data:image/png;base64,AAAA',
    async () => 'data:image/png;base64,' + 'A'.repeat(12_000_000),
    async () => {
      throw new Error('capture');
    },
  ]) {
    const { input, calls } = setup({ capture });
    expect(await shareRedemptionImage(input)).toEqual({
      status: 'error',
      error: 'capture-failed',
    });
    expect(calls).toEqual([]);
  }
});
test('OS dismissal and provider failure never claim successful sharing or trigger fallback', async () => {
  for (const [name, status] of [
    ['AbortError', 'ignored'],
    ['NotAllowedError', 'error'],
  ]) {
    const { input, calls } = setup({
      canShare: () => true,
      share: async () => {
        throw new DOMException('OS boundary', name);
      },
    });
    expect((await shareRedemptionImage(input)).status).toBe(status);
    expect(calls).toEqual(['capture']);
  }
});
