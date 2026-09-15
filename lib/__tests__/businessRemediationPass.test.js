import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  activityMatchesFilter,
  CUSTOMER_ACTIVITY_FILTERS,
  formatCustomerActivityDay,
  groupCustomerActivityByDay,
} from '../customers/activityHistory';
import {
  formatCustomerCount,
  formatCustomerResultCount,
} from '../customers/countCopy';

const readSource = (path) => readFileSync(path, 'utf8');

const LOYALTY_CREATE = 'app/(authenticated)/(business)/cards/new.tsx';
const LOYALTY_EDIT = 'app/(authenticated)/(business)/cards/[programId].tsx';
const CAMPAIGN_LIST = 'app/(authenticated)/(business)/cards/campaigns.tsx';
const CAMPAIGN_EDITOR =
  'app/(authenticated)/(business)/cards/campaign/[campaignId].tsx';
const C2C_REFERRAL =
  'app/(authenticated)/(business)/settings-business-referrals.tsx';

describe('branded plan-limit and sticky editor contracts', () => {
  test('changed entitlement flows use the branded modal instead of a native limit alert', () => {
    for (const path of [
      LOYALTY_EDIT,
      CAMPAIGN_LIST,
      CAMPAIGN_EDITOR,
      C2C_REFERRAL,
    ]) {
      const source = readSource(path);
      expect(source).toContain('PlanLimitModal');
      expect(source).not.toContain("Alert.alert('מגבלת מסלול'");
      expect(source).not.toContain('Alert.alert("מגבלת מסלול"');
    }
    expect(readSource(LOYALTY_CREATE)).not.toContain('PlanLimitModal');

    const modal = readSource('components/subscription/PlanLimitModal.tsx');
    expect(modal).toContain('blockedAction');
    expect(modal).toContain('reason');
    expect(modal).toContain('limitSummary');
    expect(modal).toContain('canManageSubscription');
    expect(modal).toContain('שדרוג');
    expect(modal).toContain('אולי בהמשך');
    expect(modal).toContain('Math.max(insets.bottom, 16)');
  });

  test('loyalty and campaign editors keep actions above keyboard and system navigation', () => {
    for (const path of [LOYALTY_CREATE, LOYALTY_EDIT, CAMPAIGN_EDITOR]) {
      const source = readSource(path);
      expect(source).toContain('KeyboardAvoidingView');
      expect(source).toContain('<EditorStickyFooter>');
    }
    expect(readSource(LOYALTY_CREATE)).toContain(
      'paddingBottom: (insets.bottom || 0) +'
    );
    expect(readSource(LOYALTY_EDIT)).toContain(
      'paddingBottom: (insets.bottom || 0) +'
    );
    expect(readSource(CAMPAIGN_EDITOR)).toContain('paddingBottom: 220');

    const primitives = readSource('components/management/EditorPrimitives.tsx');
    expect(primitives).toContain('useSafeAreaInsets');
    expect(primitives).toContain('testID="editor-sticky-footer"');
    expect(primitives).toContain('Math.max(insets.bottom, 12)');
  });

  test('visual picker selection and optical sizing stay inside fixed tiles', () => {
    const tile = readSource('components/loyalty/VisualSelectionTile.tsx');
    const icons = readSource('constants/stampIcons.ts');
    const iconRenderer = readSource('components/loyalty/StampIcon.tsx');

    expect(tile).toContain('accessibilityState={{ selected, disabled }}');
    expect(tile).toContain("overflow: 'hidden'");
    expect(tile).toContain('height: 68');
    expect(icons).toContain('opticalScale');
    expect(iconRenderer).toContain('definition.opticalScale');
  });
});

describe('customer list and activity presentation contracts', () => {
  test('customer totals and search results use correct singular/plural Hebrew', () => {
    expect(formatCustomerCount(0)).toBe('0 לקוחות');
    expect(formatCustomerCount(1)).toBe('לקוח אחד');
    expect(formatCustomerCount(3)).toBe('3 לקוחות');
    expect(formatCustomerResultCount(1, 3)).toBe('תוצאה אחת מתוך 3');
    expect(formatCustomerResultCount(2, 3)).toBe('2 תוצאות מתוך 3');

    const customers = readSource(
      'app/(authenticated)/(business)/customers.tsx'
    );
    expect(customers).toContain('formatCustomerResultCount');
    expect(customers).toContain('formatCustomerCount');
  });

  test('activity filters map only to supported event types and groups by local day', () => {
    expect(CUSTOMER_ACTIVITY_FILTERS.map((filter) => filter.label)).toEqual([
      'הכל',
      'ניקובים',
      'מימושים',
      'ביטולים',
    ]);
    expect(activityMatchesFilter('STAMP_ADDED', 'stamps')).toBe(true);
    expect(activityMatchesFilter('REWARD_REDEEMED', 'redemptions')).toBe(true);
    expect(activityMatchesFilter('STAMP_REVERTED', 'cancellations')).toBe(true);
    expect(
      activityMatchesFilter('REWARD_REDEEM_REVERTED', 'cancellations')
    ).toBe(true);
    expect(activityMatchesFilter('JOINED_PROGRAM', 'stamps')).toBe(false);

    const now = new Date(2026, 2, 18, 12).getTime();
    const yesterday = new Date(2026, 2, 17, 15).getTime();
    expect(formatCustomerActivityDay(now, now)).toBe('היום');
    expect(formatCustomerActivityDay(yesterday, now)).toBe('אתמול');
    expect(
      groupCustomerActivityByDay(
        [
          { id: '1', type: 'STAMP_ADDED', createdAt: now },
          { id: '2', type: 'STAMP_REVERTED', createdAt: yesterday },
        ],
        'all',
        now
      ).map((group) => group.title)
    ).toEqual(['היום', 'אתמול']);
  });

  test('customer details uses natural status copy, grouped filters, and compact cards', () => {
    const source = readSource(
      'components/business/BusinessCustomerCardScreen.tsx'
    );
    expect(source).not.toContain('צריך וינבאק');
    expect(source).toContain('מומלץ ליצור קשר');
    expect(source).toContain('groupCustomerActivityByDay');
    expect(source).toContain('CUSTOMER_ACTIVITY_FILTERS');
    expect(source).toContain('compactManagement={card.programs.length > 3}');
    expect(source).toContain("'/(authenticated)/(business)/customers'");
    expect(source).toContain('safeBack(');
  });
});

describe('legal, billing, deletion, and deep-screen contracts', () => {
  test('legal UI uses human link labels without implementation copy or raw URLs', () => {
    const documentScreen = readSource(
      'components/legal/LegalDocumentScreen.tsx'
    );
    const documents = readSource('lib/legalDocuments.ts');
    const visibleCopy = `${documentScreen}\n${documents}`;

    expect(visibleCopy).not.toContain('deleteMyAccountHard');
    expect(visibleCopy).not.toContain('Privacy: https://');
    expect(visibleCopy).not.toContain('Terms: https://');
    expect(documentScreen).toContain('מדיניות הפרטיות באתר');
    expect(documentScreen).toContain('תנאי השימוש באתר');
    expect(documentScreen).toContain('Linking.openURL(PRIVACY_POLICY_URL)');
    expect(documentScreen).toContain('Linking.openURL(TERMS_OF_SERVICE_URL)');
  });

  test('account deletion presents human consequences without raw table summaries', () => {
    const settings = readSource('screens/SettingsScreen.tsx');
    expect(settings).toContain('הפעולה תמחק לצמיתות את החשבון האישי');
    expect(settings).toContain('מידע שחובה לשמור לפי דין');
    expect(settings).toContain('בבעלותך עסק פעיל או סגור');
    expect(settings).toContain('מחיקה לצמיתות');
    expect(settings).not.toContain('formatWipeSummary');
    expect(settings).not.toContain('deleteSuccessPrefix');
  });

  test('billing is connected from Settings and guarded by owner capability', () => {
    const settings = readSource('screens/BusinessSettingsScreen.tsx');
    const subscription = readSource(
      'app/(authenticated)/(business)/settings-business-subscription.tsx'
    );
    expect(settings).toContain('title="המסלול שלי"');
    expect(settings).toContain('BUSINESS_ROUTES.subscription');
    expect(settings).toContain('manage_subscription === true');
    expect(subscription).toContain(
      'capabilities?.manage_subscription !== true'
    );
    expect(subscription).toContain('SubscriptionSalesPanel');
    expect(subscription).toContain('UpgradeModal');
    expect(subscription).toContain('restorePurchases');
  });

  test('business closure remains distinct, owner-gated, and connected through account data', () => {
    const account = readSource(
      'app/(authenticated)/(business)/settings-business-account.tsx'
    );
    const data = readSource(
      'app/(authenticated)/(business)/settings-business-account-data.tsx'
    );
    expect(account).toContain('title="ניהול חשבון ונתונים"');
    expect(data).toContain('title="סגירת העסק"');
    expect(data).toContain('api.business.closeBusinessAccount');
    expect(data).toContain("activeBusiness?.staffRole === 'owner'");
    expect(data).toContain('אינה ביטול מנוי');
  });

  test('focused business and customer details hide their root tab bars', () => {
    const businessLayout = readSource(
      'app/(authenticated)/(business)/_layout.tsx'
    );
    const customerLayout = readSource(
      'app/(authenticated)/(customer)/_layout.tsx'
    );
    for (const route of [
      'customer/[customerUserId]',
      'settings-business-profile-complete',
      'cards',
    ]) {
      const routeIndex = businessLayout.indexOf(`name="${route}"`);
      const nextIndex = businessLayout.indexOf('<Tabs.Screen', routeIndex + 1);
      expect(routeIndex).toBeGreaterThan(-1);
      expect(
        businessLayout.slice(routeIndex, nextIndex < 0 ? undefined : nextIndex)
      ).toContain("tabBarStyle: { display: 'none' }");
    }
    const accountIndex = customerLayout.indexOf('name="account-details"');
    const nextIndex = customerLayout.indexOf('<Tabs.Screen', accountIndex + 1);
    expect(accountIndex).toBeGreaterThan(-1);
    expect(
      customerLayout.slice(accountIndex, nextIndex < 0 ? undefined : nextIndex)
    ).toContain("tabBarStyle: { display: 'none' }");
  });
});

describe('completion and referral empty-state contracts', () => {
  test('profile completion is focused, keyboard-aware, and uses a safe sticky CTA', () => {
    const completion = readSource(
      'app/(authenticated)/(business)/settings-business-profile-complete.tsx'
    );
    const shell = readSource(
      'components/business-settings/SettingsPageShell.tsx'
    );
    expect(completion).toContain('formatCompletionProgressLabel(currentStep)');
    expect(completion).toContain("'שמירה והמשך'");
    expect(completion).toContain("'שמירה וסיום'");
    expect(completion).toContain('keyboardAware={!isAddressStep}');
    expect(completion).toContain('footer={');
    expect(shell).toContain(
      "behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"
    );
    expect(shell).toContain('paddingBottom: safeBottom + (footer ? 96 : 28)');
  });

  test('B2B and C2C empty states share the compact supported-action component', () => {
    const emptyState = readSource(
      'components/referrals/ReferralEmptyState.tsx'
    );
    const b2b = readSource(
      'app/(authenticated)/(business)/settings-business-invite-businesses.tsx'
    );
    const c2c = readSource(C2C_REFERRAL);
    expect(emptyState).toContain('actionLabel && onActionPress');
    expect(emptyState).toContain('minHeight: 40');
    expect(b2b).toContain('<ReferralEmptyState');
    expect(c2c).toContain('<ReferralEmptyState');
  });
});
