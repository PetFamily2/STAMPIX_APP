import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { findForbiddenRtlPatterns } from '../../scripts/rtl-source-contract.mjs';

const source = readFileSync('app/(auth)/onboarding-client-otp.tsx', 'utf8');
const rtlContract = readFileSync('scripts/rtl-source-contract.mjs', 'utf8');

function styleBlock(name) {
  const marker = `\n  ${name}: {`;
  const start = source.indexOf(marker);
  const end = start === -1 ? -1 : source.indexOf('\n  },', start);
  return start === -1 || end === -1 ? '' : source.slice(start, end);
}

describe('OTP verification code LTR order', () => {
  test('keeps digit 1 in the leftmost cell', () => {
    const row = styleBlock('digitsContainer');
    expect(row).toContain("flexDirection: 'row'");
    expect(row).toContain("direction: 'ltr'");
    expect(row).not.toContain('flexDirection.row');
    expect(row).not.toContain('flexDirection.rowReverse');
    expect(row).not.toContain('row-reverse');
    expect(source.match(/flexDirection:\s*'row'/g)).toEqual([
      "flexDirection: 'row'",
    ]);
    expect(source).not.toMatch(/\bflexDirection\.row\b/);
    expect(source).not.toMatch(/\bflexDirection\.rowReverse\b/);

    const input = styleBlock('digitInput');
    expect(input).toContain("writingDirection: 'ltr'");
    expect(input).toContain("textAlign: 'center'");

    expect(source).toContain('digitIndexes.map((digitIndex)');
    expect(source).toContain('value={digits[digitIndex]}');
    expect(source).not.toMatch(/digitIndexes[\s\S]{0,120}\.reverse\(/);
    expect(source).not.toContain('CODE_LENGTH - 1 - digitIndex');
    expect(source).not.toContain('CODE_LENGTH - 1 - index');
  });

  test('types left to right, deletes right to left, and keeps pasted order', () => {
    expect(source).toContain('next[index] = sanitized');
    expect(source).toContain('inputsRef.current[index + 1]?.focus()');
    expect(source).toContain('inputsRef.current[index - 1]?.focus()');
    expect(source).toContain('if (index === 0)');
    expect(source).toContain('next[index + i] = sanitized[i]');
    expect(source).toContain(
      "setDigits(sanitized.slice(0, CODE_LENGTH).split(''))"
    );
    expect(source).toContain('inputsRef.current[CODE_LENGTH - 1]?.focus()');
    expect(source).toContain('inputsRef.current[0]?.focus()');
    expect(source).toContain('textContentType="oneTimeCode"');
    expect(source).toContain('autoComplete="one-time-code"');
  });

  test('marks the active cell without flipping the Hebrew screen', () => {
    expect(styleBlock('digitCellActive')).toContain("borderColor: '#2563eb'");
    expect(styleBlock('focusCaret')).toContain("backgroundColor: '#2563eb'");
    expect(source).toContain('prefersReducedMotion === false');
    expect(source).toContain('caretHidden={isActive && isEmpty}');
    expect(styleBlock('title')).toContain("textAlign: 'right'");
    expect(styleBlock('subtitle')).toContain("textAlign: 'right'");
    expect(styleBlock('errorText')).toContain("textAlign: 'right'");
    expect(styleBlock('postAuthText')).toContain("writingDirection: 'rtl'");
  });

  test('allowlists only this OTP row as a physical LTR flex row', () => {
    expect(rtlContract).toContain(
      "'app/(auth)/onboarding-client-otp.tsx:digitsContainer:raw flexDirection row'"
    );
    expect(
      findForbiddenRtlPatterns(process.cwd()).filter((finding) =>
        finding.includes('onboarding-client-otp.tsx')
      )
    ).toEqual([]);
  });
});
