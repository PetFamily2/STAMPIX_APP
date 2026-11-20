import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const host =
  (name) =>
  ({ children, ...props }) =>
    React.createElement(name, props, children);
const component = host('component');
mock.module('react-native', () => ({
  View: host('view'),
  Text: host('text'),
  TextInput: host('input'),
  Pressable: host('button'),
  TouchableOpacity: host('button'),
  ScrollView: host('scroll'),
  ActivityIndicator: host('loading'),
  KeyboardAvoidingView: component,
  Modal: component,
  Platform: { OS: 'web' },
  StyleSheet: { create: (v) => v, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 800, height: 800 }),
}));
mock.module('react-native-safe-area-context', () => ({
  SafeAreaView: component,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
mock.module('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ dispatch() {} }),
  usePreventRemove() {},
}));
mock.module('expo-router', () => ({
  router: { back() {}, canGoBack: () => false, replace() {}, push() {} },
  useRouter: () => ({ push() {}, replace() {}, back() {} }),
  useLocalSearchParams: () => ({}),
  Redirect: component,
}));
const api = {
  referrals: { getReferralConfig: 'config', saveReferralConfig: 'save' },
  loyaltyPrograms: { createLoyaltyProgram: 'create' },
};
mock.module('@/convex/_generated/api', () => ({ api }));
let config = {
  businessId: 'biz1',
  configVersion: 1,
  isEnabled: true,
  rewardType: 'STAMP',
  rewardValue: 1,
  rewardRecipients: 'both',
  monthlyLimit: 10,
  benefitExpirationDays: 30,
};
let scope = 'biz1';
const saves = [];
let marketingConflict = false;
let lastAlert = null;
mock.module('convex/react', () => ({
  useQuery: (_, args) => (args === 'skip' ? undefined : config),
  useMutation: (name) => async (args) => {
    saves.push({ name, args });
    if (name === 'marketing' && marketingConflict)
      throw {
        data: {
          code: 'MARKETING_PROFILE_CONFLICT',
          current: {
            marketingOptIn: true,
            birthdayDay: 3,
            birthdayMonth: 4,
            anniversaryDay: null,
            anniversaryMonth: null,
          },
        },
      };
    return { ...config, ...args, configVersion: config.configVersion + 1 };
  },
}));
mock.module('@/hooks/useActiveBusiness', () => ({
  useActiveBusiness: () => ({
    activeBusinessId: scope,
    activeBusiness: { staffRole: 'owner', capabilities: {} },
  }),
}));
mock.module('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ entitlements: null }),
}));
mock.module('@/lib/domain/businessPermissions', () => ({
  resolveBusinessCapabilities: () => ({
    view_settings: true,
    edit_loyalty_cards: true,
    edit_business_profile: true,
    access_dashboard: true,
    access_customers: true,
    view_usage_quota: true,
    manage_subscription: true,
  }),
}));
mock.module('@/components/business-settings', () => ({
  SETTINGS_TOKENS: {},
  validateProfileFields: () => null,
  SettingsCard: component,
  SettingsField: component,
  SettingsSection: component,
  BusinessSettingsSubpageHeader: component,
  useSettingsContentWidth: () => 600,
}));
mock.module('@/components/referrals/ReferralEmptyState', () => ({
  ReferralEmptyState: component,
}));
mock.module('@/components/subscription/PlanLimitModal', () => ({
  PlanLimitModal: component,
}));
mock.module('@/components/ui/PaintedPressable', () => ({
  PaintedPressable: host('button'),
}));
mock.module('@/lib/alert', () => ({
  Alert: {
    alert(...args) {
      lastAlert = args;
    },
  },
}));
for (const [path, names] of [
  ['@/components/loyalty/LoyaltyCardClassic', ['LoyaltyCardClassic']],
  ['@/components/loyalty/LoyaltyThemePalette', ['LoyaltyThemePalette']],
  ['@/components/loyalty/StampIconPicker', ['StampIconPicker']],
  ['@/components/loyalty/StampShapePicker', ['StampShapePicker']],
  [
    '@/components/management',
    ['EditorStickyFooter', 'ManagementPageHeader', 'EditorPreviewSurface'],
  ],
])
  mock.module(path, () => Object.fromEntries(names.map((n) => [n, component])));
const { default: Referral } = await import(
  '../components/business-web/BusinessReferralSettings.web'
);
let tree;
try {
  await act(async () => {
    tree = create(<Referral webPresentation={true} />);
  });
  const input = () => tree.root.findAllByType('input')[0];
  assert.equal(input().props.value, '1');
  await act(async () => input().props.onChangeText('7'));
  config = { ...config, configVersion: 2, rewardValue: 9 };
  await act(async () => tree.update(<Referral webPresentation={true} />));
  assert.equal(input().props.value, '7', 'server update must preserve draft');
  const text = JSON.stringify(tree.toJSON());
  assert(
    text.includes('עודכנו') || text.includes('גרסה'),
    'conflict is rendered'
  );
  scope = 'biz2';
  config = { ...config, businessId: 'biz2', configVersion: 1, rewardValue: 3 };
  await act(async () => tree.update(<Referral webPresentation={true} />));
  assert.equal(
    input().props.value,
    '7',
    'business switch must not overwrite old draft'
  );
  assert.equal(saves.length, 0);
  const saveButton = () =>
    tree.root
      .findAllByType('button')
      .find((button) => button.props.accessibilityLabel === 'שמירת הגדרות');
  assert.equal(
    saveButton().props.disabled,
    true,
    'conflicting save is disabled'
  );
  const discard = tree.root
    .findAllByType('button')
    .find((button) =>
      button
        .findAllByType('text')
        .some((text) => String(text.props.children).includes('ויתור על הטיוטה'))
    );
  await act(async () => discard.props.onPress());
  assert.equal(input().props.value, '3');
  await act(async () => input().props.onChangeText('5'));
  await act(async () => saveButton().props.onPress());
  assert.equal(saves[0].args.expectedConfigVersion, 1);
  assert.equal(saves[0].args.businessId, 'biz2');

  console.log(
    'PASS rendered referral draft: edit, server conflict, business switch; mocked transport and host primitives'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}
const { ClassicCardWizard } = await import(
  '../components/business-web/ClassicCardWizard'
);
try {
  await act(async () => {
    tree = create(<ClassicCardWizard />);
  });
  const inputs = tree.root.findAllByType('input');
  assert(inputs.length >= 2);
  await act(async () => {
    inputs[0].props.onChangeText('כרטיס בדיקה');
    inputs[1].props.onChangeText('קפה');
  });
  assert(JSON.stringify(tree.toJSON()).includes('כרטיס בדיקה'));
  const byText = (label) =>
    tree.root
      .findAllByType('button')
      .find((button) =>
        button
          .findAllByType('text')
          .some((text) => text.props.children === label)
      );
  await act(async () => byText('המשך').props.onPress());
  await act(async () => byText('המשך').props.onPress());
  scope = 'biz3';
  await act(async () => tree.update(<ClassicCardWizard />));
  assert(JSON.stringify(tree.toJSON()).includes('העסק הפעיל השתנה'));
  assert(JSON.stringify(tree.toJSON()).includes('כרטיס בדיקה'));
  const save = byText('שמירת טיוטה');
  assert.equal(
    save.props.disabled,
    true,
    'cannot save to a different business'
  );
  const before = saves.length;
  await act(async () => save.props.onPress());
  assert.equal(saves.length, before, 'submit guard refuses changed business');
  scope = 'biz2';
  await act(async () => tree.update(<ClassicCardWizard />));
  assert.equal(byText('שמירת טיוטה').props.disabled, false);

  console.log(
    'PASS rendered card wizard: initial screen and editable draft; mocked transport and host primitives'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

let accountUser = { _id: 'user1', isActive: true, birthdayDay: 1 };
mock.module('@/contexts/UserContext', () => ({
  useSessionContext: () => ({ user: accountUser, businesses: [] }),
}));
mock.module('@/components/BackButton', () => ({ BackButton: component }));
mock.module('@/components/BusinessScreenHeader', () => ({
  default: component,
}));
mock.module('@/components/StickyScrollHeader', () => ({ default: component }));
mock.module('@/components/UserAvatar', () => ({ UserAvatar: component }));
api.users = { setMyPhone: 'phone', setMyMarketingProfile: 'marketing' };
const { default: Account } = await import(
  '../screens/CustomerAccountDetailsScreen'
);
try {
  await act(async () => {
    tree = create(<Account />);
  });
  const index = tree.root
    .findAllByType('input')
    .findIndex((input) => input.props.value === '1');
  const input = () => tree.root.findAllByType('input')[index];
  assert.equal(input().props.value, '1');
  await act(async () => input().props.onChangeText('12'));
  accountUser = { ...accountUser, birthdayDay: 3 };
  await act(async () => tree.update(<Account />));
  assert.equal(
    input().props.value,
    '12',
    'reactive account changes preserve marketing draft'
  );
  marketingConflict = true;
  const save = tree.root
    .findAllByType('button')
    .find((button) => button.props.accessibilityLabel === 'שמירת העדפות שיווק');
  await act(async () => save.props.onPress());
  assert.equal(lastAlert[0], 'הפרטים השתנו');
  assert.equal(input().props.value, '12', 'conflict must preserve the draft');
  assert.equal(saves.at(-1).args.expectedMarketingSnapshot.birthdayDay, 1);
  const load = lastAlert[2].find(
    (button) => button.text === 'טען פרטים עדכניים'
  );
  await act(async () => load.onPress());
  assert.equal(
    input().props.value,
    '3',
    'explicit reload shows authoritative value'
  );
  console.log(
    'PASS rendered customer account: marketing draft survives reactive update; mocked host/transport'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

// Exercise the real profile hook across an in-flight business switch.
let profileSettings = { businessId: 'A', name: 'Business A', updatedAt: 1 };
let resolveProfileSave;
let rejectProfileSave;
const profileWrites = [];
api.business = {
  getBusinessSettings: 'getBusinessSettings',
  updateBusinessProfile: 'updateBusinessProfile',
  updateBusinessAddress: 'updateBusinessAddress',
  saveBusinessOnboardingSnapshot: 'saveBusinessOnboardingSnapshot',
};
mock.module('convex/react', () => ({
  useQuery: (_name, args) => (args === 'skip' ? undefined : profileSettings),
  useMutation: (name) => async (args) => {
    profileWrites.push({ name, args });
    if (name === 'updateBusinessProfile')
      return new Promise((resolve, reject) => {
        resolveProfileSave = resolve;
        rejectProfileSave = reject;
      });
    if (name === 'create') return { loyaltyProgramId: 'program_created' };
    return { updatedAt: 20 };
  },
}));
const { useBusinessSettingsProfile } = await import(
  '../hooks/useBusinessSettingsProfile'
);
let profile;
function ProfileHarness() {
  profile = useBusinessSettingsProfile();
  return null;
}
try {
  scope = 'A';
  await act(async () => {
    tree = create(<ProfileHarness />);
  });
  assert.equal(profile.baseUpdatedAt, 1);
  let pending;
  await act(async () => {
    pending = profile.saveProfileFields({ name: 'Edited A' });
    await Promise.resolve();
  });
  assert.equal(profileWrites[0].args.businessId, 'A');
  assert.equal(profileWrites[0].args.expectedUpdatedAt, 1);
  scope = 'B';
  profileSettings = { businessId: 'B', name: 'Business B', updatedAt: 10 };
  await act(async () => tree.update(<ProfileHarness />));
  assert.equal(profile.baseUpdatedAt, 10);
  resolveProfileSave({ updatedAt: 2 });
  let result;
  await act(async () => {
    result = await pending;
  });
  assert.equal(result.ok, false);
  assert.equal(profile.baseUpdatedAt, 10);
  assert.equal(
    profile.snapshot.name,
    'Business B',
    'late save must not replace current business state'
  );
  console.log(
    'PASS rendered profile hook: late save cannot contaminate switched business; mocked transport'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

// Render the business form with the real profile hook and a mocked backend.
mock.module('lucide-react-native', () =>
  Object.fromEntries(
    [
      'AlertTriangle',
      'Building2',
      'Check',
      'MapPin',
      'Plus',
      'Save',
      'Tags',
      'X',
    ].map((name) => [name, component])
  )
);
mock.module('@/components/business/BusinessAddressSelector', () => ({
  default: component,
}));
mock.module('@/components/business-web/BusinessLogoField', () => ({
  BusinessLogoField: component,
}));
mock.module('@/components/ui/AppText', () => ({ AppText: host('text') }));
mock.module('@/components/WebPushSettings', () => ({ default: component }));
mock.module('@/components/web-scanner/ScannerCameraSettings', () => ({
  ScannerCameraSettings: component,
}));
const { BusinessWebSettings } = await import(
  '../components/business-web/BusinessWebSettings'
);
try {
  scope = 'A';
  profileSettings = { businessId: 'A', name: 'Business A', updatedAt: 1 };
  await act(async () => {
    tree = create(<BusinessWebSettings />);
  });
  const nameField = () =>
    tree.root
      .findAllByType('input')
      .find((node) => node.props.accessibilityLabel === 'שם העסק');
  assert.equal(nameField().props.value, 'Business A');
  await act(async () => nameField().props.onChangeText('Edited Business A'));
  const save = () =>
    tree.root
      .findAllByType('button')
      .find((node) => node.props.accessibilityLabel === 'שמירת פרטי העסק');
  let attempt;
  await act(async () => {
    attempt = save().props.onPress();
    await Promise.resolve();
  });
  rejectProfileSave(new Error('simulated failure'));
  await act(async () => {
    await attempt;
  });
  assert.equal(
    nameField().props.value,
    'Edited Business A',
    'failed save preserves draft'
  );
  scope = 'B';
  profileSettings = { businessId: 'B', name: 'Business B', updatedAt: 10 };
  await act(async () => tree.update(<BusinessWebSettings />));
  assert(JSON.stringify(tree.toJSON()).includes('העסק הפעיל השתנה'));
  scope = 'A';
  profileSettings = { businessId: 'A', name: 'Business A', updatedAt: 1 };
  await act(async () => tree.update(<BusinessWebSettings />));
  assert.equal(
    nameField().props.value,
    'Edited Business A',
    'returning to original business restores the draft'
  );
  scope = 'B';
  profileSettings = { businessId: 'B', name: 'Business B', updatedAt: 10 };
  await act(async () => tree.update(<BusinessWebSettings />));
  const discard = tree.root
    .findAllByType('button')
    .find((node) => node.props.accessibilityLabel === 'ויתור על הטיוטה');
  await act(async () => discard.props.onPress());
  assert.equal(
    nameField().props.value,
    'Business B',
    'explicit discard loads new business'
  );
  console.log(
    'PASS rendered business settings: failed save and business switches preserve draft; mocked backend'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

mock.module('@/components/loyalty/LoyaltyCard', () => ({ default: component }));
const { default: NewLoyaltyCard } = await import(
  '../app/(authenticated)/(business)/cards/new.tsx'
);
try {
  scope = 'card_business_a';
  await act(async () => {
    tree = create(<NewLoyaltyCard />);
  });
  const field = (label) =>
    tree.root
      .findAllByType('input')
      .find((node) => node.props.accessibilityLabel === label);
  const save = () =>
    tree.root
      .findAllByType('button')
      .find((node) => typeof node.props.disabled === 'boolean');
  await act(async () => {
    field('שם הכרטיסייה').props.onChangeText('New title');
    field('הטבה').props.onChangeText('New reward');
  });
  assert.equal(save().props.disabled, false);
  scope = 'card_business_b';
  await act(async () => tree.update(<NewLoyaltyCard />));
  assert.equal(save().props.disabled, true);
  assert.equal(field('שם הכרטיסייה').props.value, 'New title');
  const before = profileWrites.length;
  await act(async () => save().props.onPress());
  assert.equal(profileWrites.length, before);
  scope = 'card_business_a';
  await act(async () => tree.update(<NewLoyaltyCard />));
  await act(async () => save().props.onPress());
  assert.equal(profileWrites.at(-1).args.businessId, 'card_business_a');
  console.log(
    'PASS rendered new card: business switch blocks save and preserves draft; mocked backend'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}
