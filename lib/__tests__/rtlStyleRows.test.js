import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  findForbiddenRtlPatterns,
  RTL_SOURCE_ROOTS,
} from '../../scripts/rtl-source-contract.mjs';

const TAB_SCENE_STYLE_TOKEN = 'rtlTab' + 'SceneStyle';
const TAB_BAR_STYLE_TOKEN = 'rtlTab' + 'BarStyle';
const TAB_BAR_ITEM_STYLE_TOKEN = 'rtlTab' + 'BarItemStyle';

describe('rtl source-of-truth styles', () => {
  test('keeps app layout on manual RTL helpers with explicit LTR islands only', () => {
    expect(RTL_SOURCE_ROOTS).toContain('screens');
    expect(RTL_SOURCE_ROOTS).toContain('index.js');
    expect(findForbiddenRtlPatterns(process.cwd())).toEqual([]);
  });

  test('keeps Hebrew UI helpers anchored to the physical right edge', () => {
    const rtlSource = readFileSync('lib/rtl.ts', 'utf8');
    expect(rtlSource).toContain("row: 'row-reverse'");
    expect(rtlSource).toContain("start: 'flex-end' as FlexStyle['alignItems']");
    expect(rtlSource).toContain(
      "start: 'flex-end' as FlexStyle['justifyContent']"
    );
    expect(rtlSource).toContain(
      "export const selfStart = 'flex-end' as ViewStyle['alignSelf']"
    );
    expect(rtlSource).toContain("flexRow: 'flex-row-reverse'");
    expect(rtlSource).toContain("itemsStart: 'items-end'");
    expect(rtlSource).toContain("justifyStart: 'justify-end'");
    expect(rtlSource).toContain('export const rtlBaseView: ViewStyle = {}');
  });

  test('keeps known Android screenshot regressions anchored to Hebrew right', () => {
    const referralCard = readFileSync(
      'components/business-dashboard/BusinessReferralCard.tsx',
      'utf8'
    );
    expect(referralCard).toContain(
      'ctaRow: {\n    alignItems: alignItems.start'
    );
    expect(referralCard).toContain('alignSelf: selfStart');

    const activityRow = readFileSync(
      'components/business-dashboard/CompactActivitySummaryRow.tsx',
      'utf8'
    );
    expect(activityRow).toContain(
      'textWrap: {\n    flex: 1,\n    alignItems: alignItems.start'
    );
    expect(activityRow).toContain("direction: 'ltr'");

    const welcome = readFileSync('app/(auth)/welcome.tsx', 'utf8');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: assertion checks literal source text.
    expect(welcome).toContain('${tw.flexRow} ${tw.itemsStart} gap-4');
    expect(welcome).not.toContain('flex-row gap-4');
  });

  test('keeps Expo Router navigators off root and tab direction forcing', () => {
    const authenticatedLayout = readFileSync(
      'app/(authenticated)/_layout.tsx',
      'utf8'
    );
    expect(authenticatedLayout).toContain(
      'contentStyle: rtlScreenContentStyle'
    );

    const cardsLayout = readFileSync(
      'app/(authenticated)/(business)/cards/_layout.tsx',
      'utf8'
    );
    expect(cardsLayout).toContain('contentStyle: rtlScreenContentStyle');

    for (const layout of [
      'app/(authenticated)/(business)/_layout.tsx',
      'app/(authenticated)/(customer)/_layout.tsx',
    ]) {
      const source = readFileSync(layout, 'utf8');
      expect(source).not.toContain(`sceneStyle: ${TAB_SCENE_STYLE_TOKEN}`);
      expect(source).not.toContain(`...${TAB_BAR_STYLE_TOKEN}`);
      expect(source).not.toContain(`...${TAB_BAR_ITEM_STYLE_TOKEN}`);
    }

    for (const layout of [
      'app/(auth)/_layout.tsx',
      'app/(authenticated)/admin/_layout.tsx',
      'app/(authenticated)/merchant/_layout.tsx',
      'app/(authenticated)/merchant/onboarding/_layout.tsx',
    ]) {
      expect(readFileSync(layout, 'utf8')).toContain('rtlRouteContainerStyle');
    }

    expect(readFileSync('app/_layout.tsx', 'utf8')).not.toContain(
      'rtlRouteContainerStyle'
    );
  });

  test('keeps manual RTL provenance in the root layout', () => {
    const rtlSource = readFileSync('lib/rtl.ts', 'utf8');
    const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
    const rtlContract = JSON.parse(
      readFileSync('config/rtlArchitecture.json', 'utf8')
    );

    expect(rtlContract).toEqual({
      mode: 'manual',
      marker: 'stampaix-rtl-manual-row-right-v1',
    });
    expect(rtlSource).toContain(
      'RTL_ARCHITECTURE_MARKER = rtlArchitecture.marker'
    );
    expect(rootLayout).toContain('manual RTL helpers from lib/rtl.ts');
    expect(rootLayout).toContain('retainRtlArchitectureMarker();');
    expect(rootLayout).not.toContain('testID={RTL_ARCHITECTURE_MARKER}');
  });
});
