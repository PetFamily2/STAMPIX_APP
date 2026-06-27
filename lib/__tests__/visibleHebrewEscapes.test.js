import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEARCH_ROOTS = ['app', 'components', 'lib', 'constants'];
const HEBREW_ESCAPE = /\\u05[0-9a-fA-F]{2}/g;
const ALLOWED_ESCAPES = new Set(['\\u0590', '\\u05FF', '\\u05ff']);
const MOJIBAKE_MARKERS = [/\uFFFD/, /×[\u05d0-\u05ea]/, /Ã./, /Ð./];

function findVisibleHebrewEscapes() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', ...SEARCH_ROOTS],
    {
      encoding: 'utf8',
    }
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__'))
    .filter((file) => /\.(tsx?|jsx?|json)$/.test(file));

  const findings = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      const matches = line.match(HEBREW_ESCAPE) ?? [];
      for (const match of matches) {
        if (!ALLOWED_ESCAPES.has(match)) {
          findings.push(`${file}:${index + 1}: ${match}`);
        }
      }
    });
  }

  return findings;
}

function findMojibakeMarkers() {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', ...SEARCH_ROOTS],
    {
      encoding: 'utf8',
    }
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__'))
    .filter((file) => /\.(tsx?|jsx?|json)$/.test(file));

  const findings = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (MOJIBAKE_MARKERS.some((pattern) => pattern.test(line))) {
        findings.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  return findings;
}

describe('visible Hebrew copy escapes', () => {
  test('does not use escaped Hebrew in user-facing source files', () => {
    expect(findVisibleHebrewEscapes()).toEqual([]);
  });

  test('does not contain common UTF-8 mojibake markers in source files', () => {
    expect(findMojibakeMarkers()).toEqual([]);
  });
});
