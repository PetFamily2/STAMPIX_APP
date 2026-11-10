import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const chrome = readFileSync('lib/design/webProductChrome.ts', 'utf8');
const continueButton = readFileSync('components/ContinueButton.tsx', 'utf8');
const choiceButton = readFileSync(
  'components/OnboardingChoiceButton.tsx',
  'utf8'
);
const actionButton = readFileSync('components/ui/ActionButton.tsx', 'utf8');
const progress = readFileSync('components/OnboardingProgress.tsx', 'utf8');
const welcome = readFileSync(
  'components/public-web/WelcomeContent.tsx',
  'utf8'
);
const settingsTokens = readFileSync(
  'components/business-settings/tokens.ts',
  'utf8'
);

describe('web product chrome keeps native colors and uses dashboard navy on web', () => {
  test('shared controls branch on web without removing native accents', () => {
    expect(chrome).toContain("Platform.OS === 'web'");
    expect(chrome).toContain("T.colors.primary : '#2563EB'");
    expect(chrome).toContain("T.colors.primary : '#2F6BFF'");
    expect(continueButton).toContain("backgroundColor: '#2563eb'");
    expect(continueButton).toContain("Platform.OS === 'web'");
    expect(continueButton).toContain('T.colors.primary');
    expect(choiceButton).toContain("backgroundColor: '#2563EB'");
    expect(choiceButton).toContain("borderColor: '#E5E7EB'");
    expect(progress).toContain("T.colors.primary : '#2563EB'");
    expect(actionButton).toContain("backgroundColor: '#2F6BFF'");
    expect(actionButton).toContain("backgroundColor: '#1230A8'");
    expect(actionButton).toContain("secondary: '#1D4ED8'");
  });

  test('welcome and settings web accents use the dashboard navy', () => {
    expect(welcome).toContain('#1230A8');
    expect(welcome).toContain('font-weight:600');
    expect(welcome).not.toContain('#2563eb');
    expect(settingsTokens).toContain(
      "accent: Platform.OS === 'web' ? '#1230A8' : '#2F6BFF'"
    );
  });
});
