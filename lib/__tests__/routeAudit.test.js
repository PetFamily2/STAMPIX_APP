import { expect, test } from 'bun:test';
import {
  classifyRoute,
  publicRoute,
  routeIdentity,
} from '../../scripts/audit-route-reachability.mjs';

test('Expo aliases, groups and platform variants retain route identity', () => {
  expect(routeIdentity('app/(authenticated)/(customer)/wallet.web.tsx')).toBe(
    '/(authenticated)/(customer)/wallet'
  );
  expect(publicRoute('/(authenticated)/(customer)/wallet')).toBe('/wallet');
  expect(routeIdentity('app/(web-business)/business/index.tsx')).toBe(
    '/(web-business)/business'
  );
  expect(publicRoute('/(auth)/index')).toBe('/');
});

test('missing static references never authorizes route deletion', () => {
  expect(classifyRoute({})).toBe('UNKNOWN');
  expect(classifyRoute({ alias: true })).toBe('COMPATIBILITY');
  expect(classifyRoute({ layout: 1 })).toBe('ACTIVE');
  expect(classifyRoute({ navigation: 1 })).toBe('ACTIVE');
});
