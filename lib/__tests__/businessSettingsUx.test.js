import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildCompletionSteps,
  formatMissingFieldsCountLabel,
  formatProfileCompletionTitle,
  parseMissingProfileFields,
} from '../businessSettings/completion';
import {
  EVERYDAY_PROFILE_GROUPS,
  formatProfileFieldValue,
  isOnboardingAnalyticsField,
  PROFILE_FIELD_LABELS,
} from '../businessSettings/profileFields';

const SETTINGS_SCREEN = 'screens/BusinessSettingsScreen.tsx';
const PROFILE_SCREEN =
  'app/(authenticated)/(business)/settings-business-profile.tsx';
const COMPLETION_SCREEN =
  'app/(authenticated)/(business)/settings-business-profile-complete.tsx';
const ACCOUNT_SCREEN =
  'app/(authenticated)/(business)/settings-business-account.tsx';
const ACCOUNT_DATA_SCREEN =
  'app/(authenticated)/(business)/settings-business-account-data.tsx';
const ADDRESS_SCREEN =
  'app/(authenticated)/(business)/settings-business-address.tsx';
const TEAM_SCREEN = 'app/(authenticated)/(business)/team/index.tsx';
const TEAM_ADD_SCREEN = 'app/(authenticated)/(business)/team/add.tsx';
const INVITE_SCREEN =
  'app/(authenticated)/(business)/settings-business-invite-businesses.tsx';
const SUBSCRIPTION_SCREEN =
  'app/(authenticated)/(business)/settings-business-subscription.tsx';
const HEADER = 'components/business-settings/BusinessSettingsSubpageHeader.tsx';
const ADD_BUSINESS_CTA = 'components/business-settings/AddBusinessCta.tsx';
const SETTINGS_SECTION = 'components/business-settings/SettingsSection.tsx';
const SETTINGS_NAV_ROW = 'components/business-settings/SettingsNavRow.tsx';
const SETTINGS_PAGE_SHELL =
  'components/business-settings/SettingsPageShell.tsx';
const SETTINGS_CHOICE_LIST =
  'components/business-settings/SettingsChoiceList.tsx';
const PROFILE_FIELD_FORM = 'components/business-settings/ProfileFieldForm.tsx';
const PROFILE_COMPLETION_CARD =
  'components/business-settings/ProfileCompletionCard.tsx';
const LOGOUT_OPTIONS_SHEET =
  'components/business-settings/LogoutOptionsSheet.tsx';
const MODE_CTA = 'components/customer/BusinessModeCtaCard.tsx';
const BACK_BUTTON = 'components/BackButton.tsx';
const BASICS = 'app/(authenticated)/merchant/onboarding/business-basics.tsx';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function extractNamedStyle(source, styleName) {
  const marker = `${styleName}: {`;
  const start = source.indexOf(marker);
  if (start < 0) {
    return '';
  }

  let depth = 0;
  for (let index = start + marker.length - 1; index < source.length; index++) {
    const character = source[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return '';
}

function assertManualRtlUnchanged(source) {
  expect(source).not.toContain('I18nManager');
  expect(source).not.toContain('forceRTL');
  expect(source).not.toContain('allowRTL');
}

describe('business settings information architecture', () => {
  test('keeps the customer-mode switch card unchanged at the top', () => {
    const settings = readSource(SETTINGS_SCREEN);
    const cta = readSource(MODE_CTA);
    const cardIndex = settings.indexOf(
      '<BusinessModeCtaCard accentButton={true} />'
    );
    const selectorIndex = settings.indexOf('עסק פעיל');
    const addIndex = settings.indexOf('<AddBusinessCta');

    expect(cardIndex).toBeGreaterThan(-1);
    expect(selectorIndex).toBeGreaterThan(cardIndex);
    expect(addIndex).toBeGreaterThan(selectorIndex);
    expect(cta).toContain("switchToCustomerTitle: 'חזרה למצב לקוח'");
    expect(cta).toContain("switchToCustomerButton: 'מעבר ללקוח'");
    expect(cta).toContain('hostButtonAccent');
  });

  test('exposes add-business CTA and authenticated additional onboarding', () => {
    const settings = readSource(SETTINGS_SCREEN);
    const addBusiness = readSource(ADD_BUSINESS_CTA);
    expect(settings).toContain('<AddBusinessCta');
    expect(settings).toContain('getBusinessOnboardingEntryRoute');
    expect(addBusiness).toContain('צרפו עסק נוסף');
    expect(settings).not.toContain('/(auth)/sign-up');
  });

  test('shows completion card from real missing fields and hides it when complete', () => {
    const settings = readSource(SETTINGS_SCREEN);
    expect(settings).toContain('parseMissingProfileFields');
    expect(settings).toContain('profileCompletion.isComplete !== true');
    expect(settings).toContain('missingFields.length > 0');
    expect(settings).toContain('BUSINESS_ROUTES.profileComplete');
    expect(settings).not.toContain('missingCount={3}');
  });

  test('removes duplicate address, QR, and leave-business from the main screen', () => {
    const settings = readSource(SETTINGS_SCREEN);
    expect(settings).not.toContain('title="כתובת העסק"');
    expect(settings).not.toContain('קוד QR להצטרפות לקוחות');
    expect(settings).not.toContain('/(authenticated)/(business)/qr');
    expect(settings).not.toContain('עזוב את העסק');
    expect(settings).not.toContain('handleLeaveBusiness');
    expect(settings).toContain('title="התנתקות"');
    expect(settings).toContain('אפשרויות נוספות');
  });

  test('keeps team and invite entries permission-gated', () => {
    const settings = readSource(SETTINGS_SCREEN);
    expect(settings).toContain('BUSINESS_ROUTES.team');
    expect(settings).toContain('title="צוות והרשאות"');
    expect(settings).toContain('title="הזמנת עסקים"');
    expect(settings).toContain('{canInviteBusinesses ? (');
    expect(settings).toContain('canInviteBusinesses');
    expect(settings).toContain('invite_businesses === true');
    expect(settings).toContain('canManageSubscription');
    expect(settings).toContain('manage_subscription === true');
    expect(settings).not.toContain('{canViewBillingState ? (');
  });

  test('keeps leave/close/delete out of ordinary Settings and Account lists', () => {
    const settings = readSource(SETTINGS_SCREEN);
    const account = readSource(ACCOUNT_SCREEN);
    const accountData = readSource(ACCOUNT_DATA_SCREEN);

    expect(settings).not.toContain('title="עזיבת העסק"');
    expect(account).not.toContain('title="עזיבת העסק"');
    expect(account).not.toContain('title="סגירת העסק"');
    expect(account).not.toContain('title="מחיקת העסק לצמיתות"');
    expect(account).toContain('title="ניהול חשבון ונתונים"');
    expect(accountData).toContain('title="עזיבת העסק"');
    expect(accountData).toContain('title="סגירת העסק"');
    expect(accountData).toContain('title="מחיקת העסק לצמיתות"');
    expect(accountData).toContain('fallbackHref={BUSINESS_ROUTES.account}');
    expect(accountData).toContain('api.business.selfRemoveFromBusiness');
    expect(accountData).toContain('api.business.closeBusinessAccount');
  });
});

describe('business profile grouping and copy', () => {
  test('everyday groups exclude onboarding-only analytics fields', () => {
    const everydayFields = EVERYDAY_PROFILE_GROUPS.flatMap(
      (group) => group.fields
    );
    expect(everydayFields).toContain('address');
    expect(everydayFields).toContain('businessExample');
    expect(everydayFields).not.toContain('discoverySource');
    expect(everydayFields).not.toContain('reason');
    expect(everydayFields).not.toContain('ownerAgeRange');
    expect(isOnboardingAnalyticsField('discoverySource')).toBe(true);
    expect(PROFILE_FIELD_LABELS.businessExample).toBe('תחום העסק');
  });

  test('profile screen uses grouped interactive rows without pencil icons', () => {
    const source = readSource(PROFILE_SCREEN);
    expect(source).toContain('EVERYDAY_PROFILE_GROUPS');
    expect(source).toContain('SettingsNavRow');
    expect(source).toContain('title="פרטי העסק"');
    expect(source).not.toContain('create-outline');
    expect(source).not.toContain('מיפוי סוג עסק');
    expect(source).not.toContain('מקור הגעה');
    expect(source).not.toContain('סיבת הצטרפות');
    expect(source).not.toContain('טווח גיל בעלים');
    expect(source).toContain('accessibilityHint');
    expect(source).toContain('MISSING_VALUE');
  });

  test('empty values stay readable', () => {
    expect(
      formatProfileFieldValue('name', {
        name: '',
        shortDescription: '',
        businessPhone: '',
        formattedAddress: '',
        serviceTypes: [],
        serviceTags: [],
        usageAreas: [],
        businessExample: null,
        birthdayCampaignRelevant: null,
        joinAnniversaryCampaignRelevant: null,
        weakTimePromosRelevant: null,
        discoverySource: null,
        reason: null,
        ownerAgeRange: null,
      })
    ).toBe('לא הוגדר');
  });
});

describe('profile completion wizard', () => {
  test('builds steps from actual missing fields only', () => {
    const steps = buildCompletionSteps([
      'businessPhone',
      'address',
      'discoverySource',
    ]);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.fields).toEqual(['businessPhone']);
    expect(steps[1]?.fields).toEqual(['address']);
    expect(steps[2]?.fields).toEqual(['discoverySource']);
    expect(steps[0]?.stepIndex).toBe(1);
    expect(steps[0]?.totalSteps).toBe(3);
    expect(parseMissingProfileFields(['nope', 'name'])).toEqual(['name']);
    expect(formatMissingFieldsCountLabel(1)).toBe('נותר פרט אחד להשלמה');
    expect(formatMissingFieldsCountLabel(3)).toBe('נותרו 3 פרטים להשלמה');
    expect(formatProfileCompletionTitle(3)).toBe('הפרופיל כמעט מוכן');
  });

  test('completion screen saves through canonical mutations', () => {
    const source = readSource(COMPLETION_SCREEN);
    const hook = readSource('hooks/useBusinessSettingsProfile.ts');
    expect(source).toContain('buildCompletionSteps');
    expect(source).toContain('saveProfileFields');
    expect(source).toContain('saveOnboardingFields');
    expect(source).toContain('BUSINESS_ROUTES.address');
    expect(hook).toContain('api.business.updateBusinessProfile');
    expect(hook).toContain('api.business.saveBusinessOnboardingSnapshot');
    expect(source).not.toContain('AsyncStorage');
  });
});

describe('settings back navigation', () => {
  test('shared header uses history-first back with a safe fallback', () => {
    const header = readSource(HEADER);
    const back = readSource(BACK_BUTTON);
    expect(header).toContain('StandaloneBackTitleHeader');
    expect(header).toContain('safeBack(fallbackHref)');
    expect(header).toContain('BUSINESS_ROUTES.settings');
    expect(back).toContain('accessibilityRole="button"');
    expect(back).toContain('accessibilityLabel="חזרה"');
    expect(back).toContain('width: 44');
    expect(back).toContain('height: 44');
    expect(back).toContain('arrow-forward');
  });

  test('nested settings screens do not hardcode the wrong parent', () => {
    const profile = readSource(PROFILE_SCREEN);
    const address = readSource(ADDRESS_SCREEN);
    const team = readSource(TEAM_SCREEN);
    const teamAdd = readSource(TEAM_ADD_SCREEN);
    const invite = readSource(INVITE_SCREEN);
    const subscription = readSource(SUBSCRIPTION_SCREEN);
    const account = readSource(ACCOUNT_SCREEN);
    const accountData = readSource(ACCOUNT_DATA_SCREEN);

    expect(profile).toContain('BusinessSettingsSubpageHeader');
    expect(profile).toContain('onBackPress={closeEditor}');
    expect(address).toContain('safeBack(BUSINESS_ROUTES.profile)');
    expect(address).not.toContain('router.replace(');
    expect(team).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(team).not.toContain(
      "router.replace('/(authenticated)/(business)/dashboard')"
    );
    expect(teamAdd).toContain('fallbackHref={BUSINESS_ROUTES.team}');
    expect(teamAdd).toContain('safeBack(BUSINESS_ROUTES.team)');
    expect(invite).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(subscription).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(account).toContain('fallbackHref={BUSINESS_ROUTES.settings}');
    expect(accountData).toContain('BusinessSettingsSubpageHeader');
    expect(accountData).toContain('fallbackHref={BUSINESS_ROUTES.account}');
  });
});

describe('logout and billing', () => {
  test('device logout uses canonical signOut and does not mutate the business', () => {
    const settings = readSource(SETTINGS_SCREEN);
    const sheet = readSource(
      'components/business-settings/LogoutOptionsSheet.tsx'
    );
    expect(settings).toContain('signOut()');
    expect(settings).toContain("router.replace('/(auth)/sign-in')");
    expect(settings).not.toContain('closeBusinessAccount');
    expect(settings).not.toContain('selfRemoveFromBusiness');
    expect(settings).not.toContain('cancelSubscription');
    expect(sheet).toContain('accessibilityRole="button"');
    expect(sheet).toContain('accessibilityLabel="התנתקות מהמכשיר"');
    expect(sheet).toContain('accessibilityLabel="ביטול המנוי"');
  });

  test('subscription cancellation is permission-gated and reuses billing settings', () => {
    const settings = readSource(SETTINGS_SCREEN);
    expect(settings).toContain(
      'showCancelSubscription={canManageSubscription}'
    );
    expect(settings).toContain('BUSINESS_ROUTES.subscription');
    expect(settings).not.toContain('Purchases.cancel');
  });
});

describe('add-business onboarding back', () => {
  test('additional-flow basics returns to settings instead of first-time role', () => {
    const source = readSource(BASICS);
    expect(source).toContain('isAdditionalBusinessFlow(flow)');
    expect(source).toContain('getAdditionalBusinessOnboardingExitRoute');
    expect(source).toContain(
      'safeBack(getAdditionalBusinessOnboardingExitRoute())'
    );
  });
});

describe('business settings shared layout stretch', () => {
  test('SettingsSection stretches children and keeps the title RTL-right', () => {
    const source = readSource(SETTINGS_SECTION);
    const section = extractNamedStyle(source, 'section');
    const title = extractNamedStyle(source, 'title');

    expect(section).toContain('gap: 8');
    expect(section).toContain("alignItems: 'stretch'");
    expect(section).not.toContain('alignItems.start');
    expect(section).not.toContain('alignItems.end');
    expect(section).not.toContain("'flex-end'");
    expect(section).not.toContain("'flex-start'");
    expect(source).not.toContain("from '@/lib/rtl'");
    expect(title).toContain("width: '100%'");
    expect(title).toContain("textAlign: 'right'");
    expect(title).toContain("writingDirection: 'rtl'");
    assertManualRtlUnchanged(source);
  });

  test('SettingsGroup fills the available page-shell width', () => {
    const nav = readSource(SETTINGS_NAV_ROW);
    const shell = readSource(SETTINGS_PAGE_SHELL);
    const group = extractNamedStyle(nav, 'group');
    const content = extractNamedStyle(shell, 'content');
    const body = extractNamedStyle(shell, 'body');
    const copy = extractNamedStyle(nav, 'copy');

    expect(group).toContain("width: '100%'");
    expect(group).not.toContain('minWidth');
    expect(group).not.toContain('maxWidth');
    expect(content).toContain("width: '100%'");
    expect(content).toContain("alignSelf: 'center'");
    expect(content).not.toContain('alignItems');
    expect(body).not.toContain('alignItems');
    expect(copy).toContain('alignItems: alignItems.start');
    expect(nav).toContain('flexDirection: flexDirection.row');
    expect(shell).toContain('maxWidth = SETTINGS_TOKENS.maxWidth');
    assertManualRtlUnchanged(nav);
    assertManualRtlUnchanged(shell);
  });

  test('other shared settings surfaces keep column stretch and manual RTL rows', () => {
    const choiceList = readSource(SETTINGS_CHOICE_LIST);
    const form = readSource(PROFILE_FIELD_FORM);
    const completion = readSource(PROFILE_COMPLETION_CARD);
    const addBusiness = readSource(ADD_BUSINESS_CTA);
    const logout = readSource(LOGOUT_OPTIONS_SHEET);
    const header = readSource(HEADER);
    const list = extractNamedStyle(choiceList, 'list');
    const fieldBlock = extractNamedStyle(form, 'fieldBlock');

    expect(list).toContain("width: '100%'");
    expect(list).not.toContain('alignItems');
    expect(fieldBlock).toContain("alignItems: 'stretch'");
    expect(fieldBlock).not.toContain('alignItems.start');
    expect(extractNamedStyle(completion, 'card')).not.toContain('alignItems');
    expect(extractNamedStyle(addBusiness, 'card')).not.toContain('alignItems');
    expect(extractNamedStyle(logout, 'sheet')).not.toContain('alignItems');
    expect(header).not.toContain('alignItems.start');
    expect(extractNamedStyle(completion, 'copy')).toContain(
      'alignItems: alignItems.start'
    );
    expect(extractNamedStyle(addBusiness, 'copy')).toContain(
      'alignItems: alignItems.start'
    );
    expect(extractNamedStyle(logout, 'optionCopy')).toContain(
      'alignItems: alignItems.start'
    );

    for (const source of [
      choiceList,
      form,
      completion,
      addBusiness,
      logout,
      header,
    ]) {
      assertManualRtlUnchanged(source);
    }
  });
});
