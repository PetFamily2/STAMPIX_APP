import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getSettingsContentWidth } from '../businessSettings/layout';
import {
  getProgramGridEmptySlots,
  getProgramGridMetrics,
  getProgramGridRowCount,
  PROGRAM_GRID_COLUMNS,
} from '../scanner/programGrid';

const readSource = (path) => readFileSync(path, 'utf8');

const BUSINESS_LAYOUT = 'app/(authenticated)/(business)/_layout.tsx';
const SETTINGS_HEADER =
  'components/business-settings/BusinessSettingsSubpageHeader.tsx';
const SETTINGS_SECTION = 'components/business-settings/SettingsSection.tsx';
const SETTINGS_ROW = 'components/business-settings/SettingsNavRow.tsx';
const SETTINGS_ACCOUNT =
  'app/(authenticated)/(business)/settings-business-account.tsx';
const SETTINGS_ACCOUNT_DATA =
  'app/(authenticated)/(business)/settings-business-account-data.tsx';
const SETTINGS_SUBSCRIPTION =
  'app/(authenticated)/(business)/settings-business-subscription.tsx';
const SETTINGS_REFERRALS =
  'app/(authenticated)/(business)/settings-business-referrals.tsx';
const LOYALTY_LIST = 'app/(authenticated)/(business)/cards/index.tsx';
const LOYALTY_COMPACT = 'components/loyalty/LoyaltyCardCompact.tsx';
const LOYALTY_CARD = 'components/loyalty/LoyaltyCard.tsx';
const LOYALTY_EDITOR = 'app/(authenticated)/(business)/cards/[programId].tsx';
const CAMPAIGN_LIST = 'app/(authenticated)/(business)/cards/campaigns.tsx';
const CAMPAIGN_CARD = 'components/campaigns/CampaignManagementCard.tsx';
const CAMPAIGN_EDITOR =
  'app/(authenticated)/(business)/cards/campaign/[campaignId].tsx';
const MANAGEMENT_HEADER = 'components/management/ManagementPageHeader.tsx';
const MANAGEMENT_USAGE = 'components/management/ManagementUsageSummary.tsx';
const SCANNER = 'app/(authenticated)/(business)/scanner.tsx';
const PROGRAM_TILE = 'components/loyalty/LoyaltyProgramTile.tsx';
const RECOMMENDATION =
  'components/business-dashboard/RecommendationActionCard.tsx';
const BUSINESS_REFERRAL =
  'components/business-dashboard/BusinessReferralCard.tsx';
const BUSINESS_DASHBOARD = 'app/(authenticated)/(business)/dashboard.tsx';
const QUICK_ACTIONS = 'components/business-dashboard/QuickShortcutsGrid.tsx';
const CUSTOMERS = 'app/(authenticated)/(business)/customers.tsx';

describe('Android physical QA navigation contracts', () => {
  test('business tabs retain real history and hide true deep pages', () => {
    const source = readSource(BUSINESS_LAYOUT);
    expect(source).toContain('backBehavior="history"');
    for (const route of [
      'settings-business-account',
      'settings-business-account-data',
      'settings-business-subscription',
      'settings-business-referrals',
      'settings-business-profile',
      'settings-business-profile-complete',
    ]) {
      const routeIndex = source.indexOf(`name="${route}"`);
      const nextRouteIndex = source.indexOf('<Tabs.Screen', routeIndex + 1);
      const routeBlock = source.slice(
        routeIndex,
        nextRouteIndex < 0 ? undefined : nextRouteIndex
      );
      expect(routeBlock).toContain("tabBarStyle: { display: 'none' }");
    }
  });

  test('Settings child fallbacks follow the route hierarchy', () => {
    const header = readSource(SETTINGS_HEADER);
    const account = readSource(SETTINGS_ACCOUNT);
    const accountData = readSource(SETTINGS_ACCOUNT_DATA);
    const subscription = readSource(SETTINGS_SUBSCRIPTION);
    const referrals = readSource(SETTINGS_REFERRALS);

    expect(header).toContain('safeBack(fallbackHref)');
    expect(account).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(accountData).toContain('fallbackHref={BUSINESS_ROUTES.account}');
    expect(subscription).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(referrals).toContain(
      'fallbackHref="/(authenticated)/(business)/campaigns"'
    );
    expect(referrals).not.toContain(
      "safeBack('/(authenticated)/(business)/campaigns')"
    );
    expect(referrals).not.toContain(
      "safeBack('/(authenticated)/(business)/programs')"
    );
  });

  test('Loyalty and Campaign editors use their own management fallbacks', () => {
    const loyalty = readSource(LOYALTY_EDITOR);
    const campaign = readSource(CAMPAIGN_EDITOR);
    expect(loyalty).toContain(
      'fallbackHref="/(authenticated)/(business)/programs"'
    );
    expect(campaign).toContain(
      "safeBack('/(authenticated)/(business)/campaigns')"
    );
    expect(campaign).not.toContain(
      "safeBack('/(authenticated)/(business)/programs')"
    );
  });
});

describe('Settings layout and account hierarchy', () => {
  test('shared grouped surfaces and copy columns keep full width', () => {
    const section = readSource(SETTINGS_SECTION);
    const row = readSource(SETTINGS_ROW);
    expect(section).toContain("width: '100%'");
    expect(section).toContain("alignItems: 'stretch'");
    expect(row).toContain("alignItems: 'stretch'");
    expect(row).toContain('minWidth: 0');
    expect(row).toContain('paddingHorizontal: 16');
    expect(row).toContain('paddingVertical: 12');
    expect(row).toContain('width: 28');
    expect(row).toContain('height: 44');
    expect(getSettingsContentWidth(320, 760, 20)).toBe(280);
    expect(getSettingsContentWidth(360, 760, 20)).toBe(320);
    expect(getSettingsContentWidth(1000, 760, 20)).toBe(720);
  });

  test('deep headers reserve an accessible back target without clipping copy', () => {
    const management = readSource(MANAGEMENT_HEADER);
    const settings = readSource(SETTINGS_HEADER);
    expect(management).toContain('minHeight: 44');
    expect(management).toContain("alignItems: 'stretch'");
    expect(settings).not.toContain('titleNumberOfLines={2}');
    expect(settings).not.toContain('subtitleNumberOfLines={2}');
  });

  test('account identity is not repeated and missing phone is explicit', () => {
    const source = readSource(SETTINGS_ACCOUNT);
    expect(source).not.toContain('<InfoLine');
    expect(source).toContain('<AccountProperty');
    expect(source).toContain('isMissing={!user?.phone}');
    expect(source).toContain('טלפון אישי לחשבון');
    expect(source).toContain('נשמר בנפרד מהטלפון העסקי');
    expect(source).toContain('פרט חסר');
    expect(source).toContain('showChevron={false}');
  });
});

describe('Loyalty management QA contracts', () => {
  test('compact list preview delegates to the canonical LoyaltyCard', () => {
    const compact = readSource(LOYALTY_COMPACT);
    const list = readSource(LOYALTY_LIST);
    const card = readSource(LOYALTY_CARD);
    expect(compact).toContain("import LoyaltyCard from './LoyaltyCard'");
    expect(compact).toContain('variant="management"');
    expect(compact).toContain('compactManagement={true}');
    expect(compact).toContain('cardThemeId={cardThemeId}');
    expect(compact).toContain('stampIcon={stampIcon}');
    expect(list).toContain('businessName={businessName}');
    expect(list).toContain('businessLogoUrl={businessLogoUrl}');
    expect(card).toContain('cardManagementCompact');
  });

  test('over-limit usage is explicit and never renders progress above 100%', () => {
    const list = readSource(LOYALTY_LIST);
    const usage = readSource(MANAGEMENT_USAGE);
    expect(list).toContain('<ManagementUsageSummary');
    expect(list).toContain('הכרטיסיות והטיוטות הקיימות נשמרו');
    expect(list).toContain('הפעלה נוספת חסומה');
    expect(list).toContain("limitStatus('maxCards', activePrograms.length)");
    expect(list).not.toContain('!cardLimit.isAtLimit');
    expect(usage).toContain(
      'const overage = Math.max(0, safeUsed - safeLimit)'
    );
    expect(usage).toContain('{!isOverLimit && safeLimit > 0 ? (');
    expect(usage).toContain('Math.min(100');
  });
});

describe('Campaign management and editor QA contracts', () => {
  test('C2C referral is a normal campaign entry and B2B invitations stay separate', () => {
    const list = readSource(CAMPAIGN_LIST);
    const entitlementSource = readSource('convex/entitlements.ts');
    expect(list).toContain('type="referral"');
    expect(list).toContain('title="חבר מביא חבר"');
    expect(list).not.toContain('הזמנת עסקים');
    expect(list).not.toContain('settings-business-invite-businesses');
    expect(list).toContain('campaignLimit.currentValue');
    expect(entitlementSource).toContain(
      "candidate.kind === 'business_referral'"
    );
    expect(entitlementSource).toContain(
      "candidate.kind === 'customer_referral'"
    );
  });

  test('management screen uses compact product cards and canonical quota usage', () => {
    const list = readSource(CAMPAIGN_LIST);
    const card = readSource(CAMPAIGN_CARD);
    expect(list).toContain('<CampaignManagementCard');
    expect(list).toContain('<ManagementUsageSummary');
    expect(list).toContain("limitStatus('maxCampaigns', campaignQuotaUsed)");
    expect(list).toContain('campaign.isCountedTowardLimit');
    expect(list).toContain('referralCampaignEnabled ? 1 : 0');
    expect(list).not.toContain('מכסת קמפיינים פעילים');
    expect(list).not.toContain('העברה לארכיון זמינה רק מתוך דף עריכת הקמפיין');
    expect(card).toContain('audienceCount.toLocaleString');
    expect(card).toContain('accessibilityRole="button"');
  });

  test('Campaign editor shares the Loyalty shell and previews customer output', () => {
    const campaign = readSource(CAMPAIGN_EDITOR);
    const loyalty = readSource(LOYALTY_EDITOR);
    for (const source of [campaign, loyalty]) {
      expect(source).toContain('<ManagementPageHeader');
      expect(source).toContain('<EditorPreviewSurface');
    }
    expect(campaign).toContain('<EditorSection');
    expect(campaign).toContain('<CampaignCustomerPreview');
    expect(campaign).toContain('הודעה באפליקציה');
    expect(campaign).toContain('<EditorPrimaryActions');
    expect(campaign).toContain("isArchivedCampaign ? 'שחזור כטיוטה'");
    expect(campaign).toContain(": 'העבר לארכיון'");

    const contentIndex = campaign.indexOf('title="תוכן הקמפיין"');
    const audienceIndex = campaign.indexOf('title="קהל יעד"');
    const channelIndex = campaign.indexOf('title="ערוצים"');
    const timingIndex = campaign.indexOf('title="תזמון"');
    const advancedIndex = campaign.indexOf('title="הגדרות מתקדמות"');
    expect(contentIndex).toBeGreaterThan(-1);
    expect(audienceIndex).toBeGreaterThan(contentIndex);
    expect(channelIndex).toBeGreaterThan(audienceIndex);
    expect(timingIndex).toBeGreaterThan(channelIndex);
    expect(advancedIndex).toBeGreaterThan(timingIndex);
    expect(campaign).toContain(
      'accessibilityState={{ expanded: showAdvancedSettings }}'
    );
    expect(campaign).not.toContain('שלב 1');
  });

  test('Campaign editor protects dirty state and exposes explicit action loading', () => {
    const source = readSource(CAMPAIGN_EDITOR);
    expect(source).toContain('usePreventRemove');
    expect(source).toContain('const isDirty =');
    expect(source).toContain('יש שינויים שלא נשמרו');
    expect(source).toContain("pendingSubmitAction === 'publish'");
    expect(source).toContain("pendingSubmitAction === 'save'");
  });
});

describe('Scanner fixed-slot presentation', () => {
  test('2, 3, 4, and 5 programs preserve five-slot row math', () => {
    expect(PROGRAM_GRID_COLUMNS).toBe(5);
    expect([2, 3, 4, 5].map(getProgramGridRowCount)).toEqual([1, 1, 1, 1]);
    expect([2, 3, 4, 5].map(getProgramGridEmptySlots)).toEqual([3, 2, 1, 0]);
    const metrics = getProgramGridMetrics(347, false);
    expect(Number.isInteger(metrics.tileWidth)).toBe(true);
    expect(metrics.tileWidth * 5 + metrics.gap * 4).toBe(metrics.gridWidth);
    expect(metrics.gridWidth).toBeLessThanOrEqual(347);
    expect(readSource(SCANNER)).toContain(
      'getProgramGridMetrics(contentWidth, isTablet)'
    );
  });

  test('tile, icon canvas, and selected dimensions are invariant', () => {
    const tile = readSource(PROGRAM_TILE);
    expect(tile).toContain('const PROGRAM_ICON_CANVAS_SIZE = 30');
    expect(tile).toContain('const PROGRAM_ICON_NOMINAL_SIZE = 27');
    expect(tile).toContain('const PROGRAM_TILE_HEIGHT = 101');
    expect(tile).toContain('PROGRAM_TITLE_MAX_FONT_MULTIPLIER');
    expect(tile).toContain('overflow: \'visible\'');
    expect(tile).toContain('borderWidth: PROGRAM_TILE_BORDER_WIDTH');
    expect(tile).not.toContain('selected: {\n    borderWidth');
    expect(tile).toContain('styles.selectionSlot');
    expect(tile).toContain('styles.iconCanvas');
    expect(tile).not.toContain('styles.iconRing');
  });
});

describe('Dashboard and Customers restrained polish', () => {
  test('recommendation and B2B primary CTAs remain high-contrast and accessible', () => {
    const recommendation = readSource(RECOMMENDATION);
    const referral = readSource(BUSINESS_REFERRAL);
    const dashboard = readSource(BUSINESS_DASHBOARD);
    expect(recommendation).toContain("backgroundColor: '#1D4ED8'");
    expect(recommendation).toContain("borderColor: '#123EA8'");
    expect(recommendation).toContain("color: '#FFFFFF'");
    expect(recommendation).toContain('height: 44');
    expect(recommendation).toContain('name="time-outline"');
    expect(referral).toContain("backgroundColor: '#2F6BFF'");
    expect(referral).toContain('paddingVertical: 7');
    expect(referral).toContain('paddingHorizontal: 20');
    expect(referral).toContain('minWidth: 168');
    expect(dashboard).toContain('borderRadius: 999');
    expect(dashboard).toContain("backgroundColor: '#2F6BFF'");
    expect(dashboard).toContain('paddingVertical: 7');
    expect(dashboard).toContain('paddingHorizontal: 20');
    expect(dashboard).toContain('businessReferralButtonText: {');
    expect(dashboard).toContain("color: '#FFFFFF'");
    expect(dashboard).toContain('businessReferralButtonPressed');
    expect(dashboard).toContain('businessReferralButtonDisabled');
  });

  test('locked quick actions use an integrated fixed state slot', () => {
    const source = readSource(QUICK_ACTIONS);
    expect(source).toContain('<View style={styles.stateSlot}>');
    expect(source).toContain('name="lock-closed"');
    expect(source).toContain('height: 18');
    expect(source).toContain("alignItems: 'stretch'");
  });

  test('Customers exposes one total, compact accessible search, and navigation', () => {
    const source = readSource(CUSTOMERS);
    expect(source).not.toContain('סה"כ');
    expect(source).toContain('accessibilityLabel="חיפוש לקוח לפי שם או טלפון"');
    expect(source).toContain('minHeight: 44');
    expect(source).toContain('paddingVertical: 13');
    expect(source).toContain('<View style={styles.searchInfoStack}>');
    expect(source).toContain('searchInfoStack: {');
    expect(source).toContain('marginTop: 16');
    expect(source).not.toContain('<View style={{ marginTop: 12 }}>');
    expect(source).toContain('accessibilityLabel={`פתיחת הלקוח');
    expect(source).toContain('customer.phone');
    expect(source).toContain('customer.primaryProgramName');
  });

  test('affected shared sources keep manual RTL and font scaling enabled', () => {
    for (const path of [
      SETTINGS_HEADER,
      SETTINGS_ROW,
      MANAGEMENT_HEADER,
      CAMPAIGN_CARD,
      RECOMMENDATION,
      QUICK_ACTIONS,
      CUSTOMERS,
    ]) {
      const source = readSource(path);
      expect(source).not.toContain('I18nManager');
      expect(source).not.toContain('forceRTL');
      expect(source).not.toContain('allowRTL');
      expect(source).not.toContain('allowFontScaling={false}');
    }
  });
});
