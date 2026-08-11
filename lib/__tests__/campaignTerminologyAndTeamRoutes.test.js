import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { BUSINESS_ROUTES } from '../navigation/businessRoutes';

const CAMPAIGN_ENTITY_SOURCES = [
  {
    path: 'app/(authenticated)/(business)/cards/campaigns.tsx',
    expectedTerminology: 'title="קמפיינים"',
  },
  {
    path: 'app/(authenticated)/(business)/cards/campaign/[campaignId].tsx',
    expectedTerminology: 'title="עריכת קמפיין"',
  },
  {
    path: 'app/(authenticated)/(staff)/promotions.tsx',
    expectedTerminology: 'title="קמפיינים פעילים"',
  },
  {
    path: 'lib/subscription/lockedAreaCopy.ts',
    expectedTerminology: "sectionTitle: 'מרכז הקמפיינים'",
  },
  {
    path: 'lib/subscription/planComparison.ts',
    expectedTerminology: "maxCampaigns: 'קמפיינים פעילים",
  },
];

const CAMPAIGN_LABEL_SOURCES = [
  'app/(authenticated)/(business)/_layout.tsx',
  'app/(authenticated)/(staff)/_layout.tsx',
  'lib/dashboard/navigationCopy.ts',
];

const LEGACY_CARDS_ROUTE_SOURCE =
  'app/(authenticated)/(business)/cards/index.tsx';

const GENERIC_CAMPAIGN_NAVIGATION_LABEL =
  /(?:(?:campaigns|promotions):\s*|label:\s*|title=|return\s+)["']מבצעים["']/;

const CAMPAIGN_AWARE_NAVIGATION_SOURCES = [
  ...CAMPAIGN_LABEL_SOURCES,
  'app/(authenticated)/(business)/dashboard.tsx',
  LEGACY_CARDS_ROUTE_SOURCE,
];

const TEAM_NAVIGATION_SOURCES = [
  'app/(authenticated)/(business)/dashboard.tsx',
  'app/(authenticated)/(business)/team/add.tsx',
  'lib/recommendations/navigation.ts',
  'screens/BusinessSettingsScreen.tsx',
];

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

describe('campaign display terminology', () => {
  test('campaign entity screens and production subscription copy use קמפיין terminology', () => {
    for (const { path, expectedTerminology } of CAMPAIGN_ENTITY_SOURCES) {
      const source = readSource(path);

      expect(source).toContain(expectedTerminology);
      expect(source).not.toMatch(/מבצע(?:ים|י|ה|ו|ל|ם)?/);
    }
  });

  test('campaign navigation labels use קמפיינים instead of מבצעים', () => {
    for (const relativePath of CAMPAIGN_LABEL_SOURCES) {
      const source = readSource(relativePath);

      expect(source).toContain('קמפיינים');
    }
  });

  test('campaign-aware navigation sources reject generic מבצעים labels', () => {
    for (const relativePath of CAMPAIGN_AWARE_NAVIGATION_SOURCES) {
      expect(readSource(relativePath)).not.toMatch(
        GENERIC_CAMPAIGN_NAVIGATION_LABEL
      );
    }
  });

  test('legacy cards campaigns section redirects to the canonical campaigns route', () => {
    const source = readSource(LEGACY_CARDS_ROUTE_SOURCE);

    expect(source).toContain("section === 'campaigns'");
    expect(source).toContain("'/(authenticated)/(business)/campaigns'");
    expect(source).not.toMatch(GENERIC_CAMPAIGN_NAVIGATION_LABEL);
  });

  test('legitimate offer and reward terminology remains intact', () => {
    expect(
      readSource('app/(authenticated)/(business)/cards/index.tsx')
    ).toContain('אין כפל מבצעים');
    expect(readSource('app/(authenticated)/(customer)/rewards.tsx')).toContain(
      'הטבות ומבצעים'
    );
    expect(
      readSource('app/(authenticated)/(business)/settings-business-profile.tsx')
    ).toContain('האם מבצע יום הולדת רלוונטי לעסק?');
  });
});

describe('canonical Team navigation entry points', () => {
  test('ordinary Team entry points use the production canonical route constant', () => {
    expect(BUSINESS_ROUTES.team).toBe('/(authenticated)/(business)/team');

    for (const relativePath of TEAM_NAVIGATION_SOURCES) {
      expect(readSource(relativePath)).toContain('BUSINESS_ROUTES.team');
    }
  });

  test('no Team navigation entry references the broken index pathname', () => {
    for (const relativePath of TEAM_NAVIGATION_SOURCES) {
      expect(readSource(relativePath)).not.toContain(
        '/(authenticated)/(business)/team/index'
      );
    }
  });
});
