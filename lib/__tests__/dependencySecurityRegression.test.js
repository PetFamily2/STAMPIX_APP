import { expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { getToken } from '@auth/core/jwt';
import decodeUriComponent from 'decode-uri-component';
import queryString from 'query-string';
import { quote } from 'shell-quote';
import { Header, Parser } from 'tar';

test('hardened URI decoding retains legacy form and CommonJS query-string behavior', () => {
  expect(decodeUriComponent('hello+world%2Bvalue')).toBe('hello world+value');
  expect(decodeUriComponent(encodeURIComponent('שלום 🙂'))).toBe('שלום 🙂');
  expect(
    queryString.parse('name=%D7%A9%D7%9C%D7%95%D7%9D+world&code=a%2Bb')
  ).toMatchObject({
    name: 'שלום world',
    code: 'a+b',
  });
  expect(() => decodeUriComponent(null)).toThrow(TypeError);
  expect(decodeUriComponent('%2541')).toBe('%41');
});

test('malformed percent runs are decoded once without recursive expansion', () => {
  const input = '%FF%41'.repeat(10000);
  const decoded = decodeUriComponent(input);
  expect(decoded).toBe('%FFA'.repeat(10000));
  expect(decodeUriComponent('%E0%A4%A')).toBe('%E0%A4%A');
});

test('malformed bearer percent encoding is rejected without an authentication exception', async () => {
  for (const token of ['%', '%ZZ', '%E0%A4%A']) {
    const request = new Request('https://example.invalid', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(
      await getToken({ req: request, secret: 'local-regression-only' })
    ).toBeNull();
  }
});

test('shell quoting rejects operator tokens containing a second command', () => {
  for (const op of ['\n', '\r', ';\nprintf unsafe', '\u2028']) {
    expect(() => quote(['echo', { op }, 'text'])).toThrow(TypeError);
  }
  expect(quote(['echo', 'a b'])).toBe("echo 'a b'");
});

test('archive parser aborts a bounded high-ratio gzip fixture before extraction', async () => {
  const body = Buffer.alloc(64 * 1024);
  const header = new Header({
    path: 'test.txt',
    size: body.length,
    mode: 0o600,
    type: 'File',
  });
  header.encode();
  const compressed = gzipSync(
    Buffer.concat([header.block, body, Buffer.alloc(1024)])
  );
  const error = await new Promise((resolve, reject) => {
    const parser = new Parser({ maxDecompressionRatio: 8 });
    parser.on('entry', (entry) => entry.resume());
    parser.on('error', resolve);
    parser.on('end', () => reject(new Error('Archive limit was not enforced')));
    parser.end(compressed);
  });
  expect(error.message).toContain('max decompression ratio exceeded');
});
