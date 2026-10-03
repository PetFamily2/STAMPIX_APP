import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('web typography contract', () => {
  test('auth and Business Web use the same Heebo family as the sales site', () => {
    const css = readFileSync('global.css', 'utf8');

    expect(css).toContain('family=Heebo');
    expect(css).toContain("font-family: 'Heebo', Arial, sans-serif");
    expect(css).toContain('font-synthesis: none');
    expect(css).toContain('text-rendering: optimizeLegibility');
  });

  test('the web font contract is global to React Native Web surfaces', () => {
    const css = readFileSync('global.css', 'utf8');

    expect(css).toContain('body *');
    expect(css).toContain('#root *');
    expect(css).toContain('!important');
  });
});
