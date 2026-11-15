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
mock.module('convex/react', () => ({
  useQuery: (_, args) => (args === 'skip' ? undefined : config),
  useMutation: (name) => async (args) => {
    saves.push({ name, args });
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
    access_dashboard: true,
    access_customers: true,
    view_usage_quota: true,
    manage_subscription: true,
  }),
}));
mock.module('@/components/business-settings', () => ({
  SETTINGS_TOKENS: {},
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
mock.module('@/lib/alert', () => ({ Alert: { alert() {} } }));
for (const [path, names] of [
  ['@/components/loyalty/LoyaltyCardClassic', ['LoyaltyCardClassic']],
  ['@/components/loyalty/LoyaltyThemePalette', ['LoyaltyThemePalette']],
  ['@/components/loyalty/StampIconPicker', ['StampIconPicker']],
  ['@/components/loyalty/StampShapePicker', ['StampShapePicker']],
  ['@/components/management', ['EditorStickyFooter', 'ManagementPageHeader']],
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
  console.log(
    'PASS rendered customer account: marketing draft survives reactive update; mocked host/transport'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}
