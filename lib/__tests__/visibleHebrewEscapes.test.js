import { describe, expect, test } from 'bun:test';
import {
  findVisibleHebrewProblems,
  RTL_SOURCE_ROOTS,
} from '../../scripts/rtl-source-contract.mjs';

describe('visible Hebrew copy escapes', () => {
  test('does not use escaped Hebrew in user-facing source files', () => {
    expect(RTL_SOURCE_ROOTS).toContain('screens');
    expect(findVisibleHebrewProblems(process.cwd())).toEqual([]);
  });
});
