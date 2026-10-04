// Hermetic rendered-layout verification. No Convex connection or mutations.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { getFunctionName } from 'convex/server';
import React from 'react';
import { act, create } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_APP_ENV = 'preview';
process.env.EXPO_PUBLIC_WEB_ROLE_ROUTING = 'true';
const state = {
  platform: 'web',
  auth: { isAuthenticated: true, isLoading: false },
  user: { customerOnboardedAt: 1, businessOnboardedAt: 1 },
  session: { activeMode: 'customer', activeBusinessId: null, businesses: [] },
  segments: ['(authenticated)', '(customer)', 'wallet'],
  params: {},
  draft: null,
};
const host = (name) => (props) =>
  React.createElement(name, props, props.children);
const Stack = host('stack');
Stack.Screen = host('screen');
mock.module('react-native', () => ({
  Platform: {
    get OS() {
      return state.platform;
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: host('view'),
}));
mock.module('expo-router', () => ({
  Redirect: host('redirect'),
  Slot: host('slot'),
  Stack,
  useLocalSearchParams: () => state.params,
  useSegments: () => state.segments,
  useRouter: () => ({ replace() {} }),
}));
mock.module('convex/react', () => ({
  useConvexAuth: () => state.auth,
  useQuery: (reference, args) => {
    if (args === 'skip') {
      return undefined;
    }
    const name = getFunctionName(reference);
    if (name === 'users:getCurrentUser') {
      return state.user;
    }
    if (name === 'users:getSessionContext') {
      return state.session;
    }
    return state.draft;
  },
}));
mock.module('@/contexts/UserContext', () => ({
  useUser: () => ({ user: state.user, isLoading: state.user === undefined }),
  useSessionContext: () => state.session,
}));
mock.module('@/hooks/useActiveBusiness', () => ({
  useActiveBusiness: () => ({
    activeBusinessId: state.session?.activeBusinessId,
  }),
}));
mock.module('@/contexts/AppModeContext', () => ({
  useAppMode: () => ({
    appMode: 'customer',
    isLoading: false,
    syncAppMode: async () => {},
  }),
}));
mock.module('@/components/FullScreenLoading', () => ({
  FullScreenLoading: host('loading'),
}));
mock.module('@/components/navigation/NativeCompanionRedirect', () => ({
  NativeCompanionRedirect: host('native-companion'),
}));
mock.module('@/components/business-web/BusinessWebShellRoute', () => ({
  BusinessWebShellRoute: host('business-shell'),
}));
mock.module('@/components/customer/CustomerStampCelebrationHost', () => ({
  default: host('stamp-host'),
}));
mock.module('@/components/customer/RedemptionCelebrationHost', () => ({
  default: host('redemption-host'),
}));
mock.module('@/lib/deeplink/pendingJoin', () => ({
  savePendingJoin: async () => {},
}));

const { default: Business } = await import(
  '../app/(web-business)/business/_layout'
);
const { default: Staff } = await import('../app/(web-staff)/staff/_layout');
const { default: Authenticated } = await import(
  '../app/(authenticated)/_layout'
);
const { default: Auth } = await import('../app/(auth)/_layout');
const wallet = '/(authenticated)/(customer)/wallet';
let checked = 0;
async function check(Component, expectedType, expectedHref) {
  let rendered;
  await act(async () => {
    rendered = create(React.createElement(Component));
  });
  const node = rendered.toJSON();
  assert.equal(node.type, expectedType);
  if (expectedHref) {
    assert.equal(node.props.href, expectedHref);
  }
  await act(async () => rendered.unmount());
  checked += 1;
}

await check(Business, 'redirect', wallet);
await check(Staff, 'redirect', wallet);
await check(Authenticated, 'view');
state.segments = ['(authenticated)', '(staff)', 'scanner'];
await check(Authenticated, 'redirect', wallet);
for (const role of ['owner', 'manager', 'staff']) {
  state.session = {
    activeMode: 'business',
    activeBusinessId: 'fixture-business',
    businesses: [{ id: 'fixture-business', staffRole: role }],
  };
  const href = role === 'staff' ? '/staff' : '/business';
  await check(
    Business,
    role === 'staff' ? 'redirect' : 'business-shell',
    role === 'staff' ? href : undefined
  );
  await check(
    Staff,
    role === 'staff' ? 'slot' : 'redirect',
    role === 'staff' ? undefined : href
  );
  await check(Authenticated, 'redirect', href);
}
state.session = undefined;
await check(Business, 'loading');
await check(Staff, 'loading');
await check(Authenticated, 'loading');
// A mounted staff shell must disappear when its canonical membership changes.
state.session = {
  activeMode: 'business',
  activeBusinessId: 'fixture-business',
  businesses: [{ id: 'fixture-business', staffRole: 'staff' }],
};
let changingStaff;
await act(async () => {
  changingStaff = create(React.createElement(Staff));
});
assert.equal(changingStaff.toJSON().type, 'slot');
state.session = {
  activeMode: 'business',
  activeBusinessId: 'fixture-business',
  businesses: [],
};
await act(async () => {
  changingStaff.update(React.createElement(Staff));
});
assert.equal(changingStaff.toJSON().props.href, wallet);
state.auth.isAuthenticated = false;
await act(async () => {
  changingStaff.update(React.createElement(Staff));
});
assert.equal(changingStaff.toJSON().props.href, '/(auth)/sign-up');
await act(async () => changingStaff.unmount());
checked += 3;
state.auth.isAuthenticated = false;
state.params = { preview: 'true', map: 'true' };
await check(Business, 'redirect', '/(auth)/sign-up');
await check(Staff, 'redirect', '/(auth)/sign-up');
await check(Authenticated, 'redirect', '/(auth)/sign-up');
await check(Auth, 'view');
state.auth.isAuthenticated = true;
state.user = { customerOnboardedAt: null };
state.session = { activeMode: 'customer', businesses: [] };
state.segments = ['(auth)', 'name-capture'];
await check(Auth, 'view');
await check(Staff, 'redirect', '/(auth)/name-capture');
for (const platform of ['ios', 'android']) {
  state.platform = platform;
  await check(Business, 'native-companion');
  await check(Staff, 'native-companion');
}
// biome-ignore lint/suspicious/noConsole: fixture verification count only.
console.log(
  `Rendered Web route gates passed (${checked} cases; no backend connection).`
);
