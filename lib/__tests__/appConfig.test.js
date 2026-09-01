import { describe, expect, test } from 'bun:test';

import defineConfig, {
  withEnvironmentAwareNotifications,
} from '../../app.config';
import appJson from '../../app.json';

const baseConfig = appJson.expo;

function getNotificationsPlugin(config) {
  const matches = config.plugins.filter((plugin) => {
    const pluginName = typeof plugin === 'string' ? plugin : plugin[0];
    return pluginName === 'expo-notifications';
  });

  expect(matches).toHaveLength(1);
  expect(Array.isArray(matches[0])).toBe(true);
  return matches[0];
}

function expectIosIdentityAndCapabilities(config) {
  expect(config.ios.bundleIdentifier).toBe('com.stampaix.app');
  expect(config.ios.usesAppleSignIn).toBe(true);
  expect(
    config.ios.entitlements['com.apple.developer.applesignin']
  ).toEqual(['Default']);
  expect(config.ios.associatedDomains).toEqual(['applinks:stampaix.com']);
}

describe('environment-aware Expo notification configuration', () => {
  test('production selects the production APNs mode and preserves config', () => {
    const config = withEnvironmentAwareNotifications(baseConfig, 'production');
    const [, options] = getNotificationsPlugin(config);

    expect(options).toEqual({
      color: '#2F6BFF',
      defaultChannel: 'default',
      mode: 'production',
    });
    expectIosIdentityAndCapabilities(config);
  });

  test('non-production selects the development APNs mode', () => {
    const config = withEnvironmentAwareNotifications(baseConfig, 'development');
    const [, options] = getNotificationsPlugin(config);

    expect(options).toEqual({
      color: '#2F6BFF',
      defaultChannel: 'default',
      mode: 'development',
    });
    expect(options.mode).not.toBe('production');
    expectIosIdentityAndCapabilities(config);
  });

  test('the exported config reads and normalizes EXPO_PUBLIC_APP_ENV', () => {
    const previousAppEnvironment = process.env.EXPO_PUBLIC_APP_ENV;

    try {
      process.env.EXPO_PUBLIC_APP_ENV = ' Production ';
      const config = defineConfig({});
      const [, options] = getNotificationsPlugin(config);

      expect(options.mode).toBe('production');
    } finally {
      if (previousAppEnvironment === undefined) {
        delete process.env.EXPO_PUBLIC_APP_ENV;
      } else {
        process.env.EXPO_PUBLIC_APP_ENV = previousAppEnvironment;
      }
    }
  });
});
