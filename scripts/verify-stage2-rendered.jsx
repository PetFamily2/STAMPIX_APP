import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const browserListeners = new Set();
let removalBlocked = false;
globalThis.window = {
  addEventListener(name) {
    browserListeners.add(name);
  },
  removeEventListener(name) {
    browserListeners.delete(name);
  },
};
const host =
  (name) =>
  ({ children, ...props }) =>
    React.createElement(name, props, children);
const component = host('component');
mock.module('react-native', () => ({
  View: host('view'),
  Text: host('text'),
  TextInput: host('input'),
  Image: host('image'),
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
  usePreventRemove(enabled) {
    removalBlocked = enabled;
  },
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
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
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
  SettingsPrimaryButton: host('address-save'),
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
  useUser: () => ({ user: { _id: 'owner' } }),
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

mock.module('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: async () => undefined }),
}));
mock.module('@/components/ContinueButton', () => ({
  ContinueButton: host('continue'),
}));
mock.module('@/components/OnboardingProgress', () => ({
  OnboardingProgress: component,
}));
mock.module('@/components/StandaloneBackTitleHeader', () => ({
  StandaloneBackTitleHeader: component,
}));
mock.module('@/lib/navigation', () => ({
  safeBack() {},
  safePush() {},
  safeDismissTo() {},
}));
api.users.getCurrentUser = 'currentUser';
api.users.setMyName = 'setName';
api.auth = { createOrUpdateUser: 'bootstrap' };
let nameUser = {
  _id: 'test_user',
  externalId: 'google:fixture',
  firstName: 'Original',
  lastName: 'Name',
};
const nameWrites = [];
mock.module('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => nameUser,
  useMutation: () => async (args) => {
    nameWrites.push(args);
    if (nameWrites.length === 1)
      throw {
        data: {
          code: 'ACCOUNT_NAME_CONFLICT',
          current: { firstName: 'Other', lastName: 'Session' },
        },
      };
  },
}));
const { default: NameCapture } = await import('../app/(auth)/name-capture.tsx');
try {
  await act(async () => {
    tree = create(<NameCapture />);
  });
  const field = () => tree.root.findAllByType('input')[0];
  assert.equal(field().props.value, 'Original');
  await act(async () => field().props.onChangeText('My draft'));
  nameUser = { ...nameUser, firstName: 'Other', lastName: 'Session' };
  await act(async () => tree.update(<NameCapture />));
  const submit = () => tree.root.findByType('continue').props.onPress();
  await act(async () => submit());
  assert.deepEqual(nameWrites[0].expectedName, {
    firstName: 'Original',
    lastName: 'Name',
  });
  assert.equal(field().props.value, 'My draft');
  assert(lastAlert[0].includes('השם השתנה'));
  await act(async () => lastAlert[2][1].onPress());
  assert.equal(field().props.value, 'Other');
  await act(async () => submit());
  assert.deepEqual(nameWrites[1].expectedName, {
    firstName: 'Other',
    lastName: 'Session',
  });
  console.log(
    'PASS rendered name capture: server conflict preserves draft, explicit reload adopts latest version; mocked backend'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

const originalProgram = {
  title: 'Saved card',
  rewardName: 'Coffee',
  maxStamps: '10',
  cardTerms: '',
  rewardConditions: '',
  stampIcon: 'star',
  stampShape: 'circle',
  cardThemeId: 'midnight-luxe',
  imageStorageId: null,
  imagePreviewUri: null,
};
let programScope = 'card_a';
let serverProgram = { ...originalProgram, programId: 'card_1', updatedAt: 1 };
const programWrites = [];
api.loyaltyPrograms.getOnboardingProgramForEdit = 'onboarding_program';
api.loyaltyPrograms.createOrResumeBusinessOnboardingProgram = 'save_program';
api.loyaltyPrograms.generateProgramImageUploadUrl = 'upload_program';
api.loyaltyPrograms.listThemeReservationsByBusiness = 'reservations';
mock.module('expo-image-picker', () => ({
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: 'images' },
}));
mock.module('@/contexts/OnboardingContext', () => ({
  useOnboarding() {
    const [programDraft, setProgramDraft] = React.useState(originalProgram);
    const [programId, setProgramId] = React.useState('card_1');
    return {
      businessId: programScope,
      programDraft,
      setProgramDraft,
      programId,
      setProgramId,
    };
  },
}));
mock.module('@/contexts/UserContext', () => ({
  useUser: () => ({ user: { _id: 'owner' } }),
}));
mock.module('@/lib/onboarding/useBusinessOnboardingDraftPersistence', () => ({
  useBusinessOnboardingDraftPersistence: () => ({
    saveStep: async () => undefined,
  }),
}));
mock.module('@/lib/analytics/activation', () => ({
  trackActivationEvent: async () => undefined,
}));
mock.module('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: (name) => (name === 'onboarding_program' ? serverProgram : []),
  useMutation: (name) => async (args) => {
    programWrites.push({ name, args });
    return { loyaltyProgramId: 'card_1' };
  },
}));
const { default: OnboardingProgram } = await import(
  '../app/(authenticated)/merchant/onboarding/create-program.tsx'
);
try {
  await act(async () => {
    tree = create(<OnboardingProgram />);
  });
  const field = () =>
    tree.root
      .findAllByType('input')
      .find((node) => node.props.accessibilityLabel === 'שם הכרטיסיה');
  const save = () =>
    tree.root
      .findAllByType('continue')
      .find((node) => node.props.label.startsWith('שמירה'));
  const load = () =>
    tree.root
      .findAllByType('continue')
      .find((node) => node.props.label.startsWith('טעינת הכרטיסייה'));
  await act(async () => field().props.onChangeText('Local draft'));
  assert.equal(removalBlocked, true);
  assert(browserListeners.has('beforeunload'));
  programScope = 'card_b';
  await act(async () => tree.update(<OnboardingProgram />));
  assert.equal(save().props.disabled, true);
  await act(async () => save().props.onPress());
  assert.equal(programWrites.length, 0);
  programScope = 'card_a';
  serverProgram = {
    ...serverProgram,
    title: 'Second session title',
    updatedAt: 2,
  };
  await act(async () => tree.update(<OnboardingProgram />));
  assert.equal(field().props.value, 'Local draft');
  assert.equal(save().props.disabled, true);
  await act(async () => load().props.onPress());
  assert.equal(field().props.value, 'Second session title');
  assert.equal(removalBlocked, false);
  assert(!browserListeners.has('beforeunload'));
  await act(async () => save().props.onPress());
  assert.deepEqual(programWrites[0].args.expectedProgram, {
    programId: 'card_1',
    updatedAt: 2,
  });
  assert.equal(programWrites[0].args.businessId, 'card_a');
  console.log(
    'PASS rendered onboarding program: stale draft, business switch, navigation and refresh guard; mocked backend'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}

api.business.getBusinessSettings = 'readAddress';
api.business.updateBusinessAddress = 'saveAddress';
const originalAddress = {
  formattedAddress: '10 Original Street',
  placeId: 'original',
  location: { lat: 32, lng: 34 },
  city: 'Test City',
  street: 'Original Street',
  streetNumber: '10',
  updatedAt: 1,
};
let addressSnapshot = originalAddress;
const addressWrites = [];
mock.module('convex/react', () => ({
  useQuery: (name, args) =>
    name === 'readAddress' && args !== 'skip' ? addressSnapshot : undefined,
  useMutation: () => async (args) => {
    addressWrites.push(args);
    if (addressWrites.length === 1) {
      throw {
        data: {
          code: 'EDIT_CONFLICT',
          entity: 'business',
          entityId: scope,
          serverUpdatedAt: 3,
        },
      };
    }
    return { updatedAt: 4 };
  },
}));
mock.module('@/components/business/BusinessAddressSelector', () => ({
  default: host('address-picker'),
}));
mock.module('@/components/guidance/GuidedActionAnchor', () => ({
  useGuidedTargetRef: () => () => {},
}));
mock.module('@/components/guidance/GuidedActionOverlay', () => ({
  GuidedActionScreenOverlay: component,
}));
const { default: BusinessAddress } = await import(
  '../app/(authenticated)/(business)/settings-business-address.tsx'
);
tree = null;
try {
  await act(async () => {
    tree = create(<BusinessAddress />);
  });
  const picker = () => tree.root.findByType('address-picker');
  const save = () => tree.root.findByType('address-save');
  const reload = () =>
    tree.root
      .findAllByType('button')
      .find((button) => button.props.accessibilityState);
  const localAddress = {
    formattedAddress: '20 Draft Street',
    placeId: 'draft',
    latitude: 32,
    longitude: 34,
    city: 'Test City',
    street: 'Draft Street',
    streetNumber: '20',
  };
  await act(async () => picker().props.onSelectedAddressChange(localAddress));
  assert(browserListeners.has('beforeunload'));
  await act(async () => save().props.onPress());
  assert.equal(addressWrites[0].expectedUpdatedAt, 1);
  assert.equal(reload().props.disabled, true);
  addressSnapshot = { ...originalAddress, updatedAt: 2 };
  await act(async () => tree.update(<BusinessAddress />));
  assert.equal(reload().props.disabled, true);
  await act(async () => reload().props.onPress());
  await act(async () => save().props.onPress());
  assert.equal(addressWrites.length, 1);
  assert.deepEqual(picker().props.selectedAddress, localAddress);
  addressSnapshot = { ...originalAddress, updatedAt: 3 };
  await act(async () => tree.update(<BusinessAddress />));
  assert.equal(reload().props.disabled, false);
  await act(async () => reload().props.onPress());
  assert.equal(picker().props.selectedAddress.placeId, 'original');
  assert(!browserListeners.has('beforeunload'));
  await act(async () => picker().props.onSelectedAddressChange(localAddress));
  await act(async () => save().props.onPress());
  assert.equal(addressWrites[1].expectedUpdatedAt, 3);
  console.log(
    'PASS rendered business address: stale reload preserves draft and blocks writes; mocked backend'
  );
} finally {
  if (tree) await act(async () => tree.unmount());
}
