import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import defineConfig, {
  withEnvironmentAwareNotifications,
} from '../../app.config';
import appJson from '../../app.json';

const baseConfig = appJson.expo;
const NOTIFICATION_ICON_PATH = './assets/images/notification-icon.png';
const notificationIconUrl = new URL(
  '../../assets/images/notification-icon.png',
  import.meta.url
);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function readRgbaPng(fileUrl) {
  const png = readFileSync(fileUrl);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colorType = png[25];
  const idatChunks = [];

  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatChunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }

  expect(bitDepth).toBe(8);
  expect(colorType).toBe(6);

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const encodedRow = y * (stride + 1);
    const filter = encoded[encodedRow];
    const outputRow = y * stride;

    expect(filter).toBeGreaterThanOrEqual(0);
    expect(filter).toBeLessThanOrEqual(4);

    for (let x = 0; x < stride; x += 1) {
      const left =
        x >= bytesPerPixel ? pixels[outputRow + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[outputRow - stride + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[outputRow - stride + x - bytesPerPixel]
          : 0;
      let value = encoded[encodedRow + 1 + x];

      if (filter === 1) {
        value += left;
      } else if (filter === 2) {
        value += up;
      } else if (filter === 3) {
        value += Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value += paeth(left, up, upperLeft);
      }

      pixels[outputRow + x] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

function getPlugin(config, pluginName) {
  const matches = config.plugins.filter((plugin) => {
    const configuredName = typeof plugin === 'string' ? plugin : plugin[0];
    return configuredName === pluginName;
  });

  expect(matches).toHaveLength(1);
  expect(Array.isArray(matches[0])).toBe(true);
  return matches[0];
}

function getNotificationsPlugin(config) {
  return getPlugin(config, 'expo-notifications');
}

function expectCanonicalIdentityAndCapabilities(config) {
  expect(config.android.package).toBe('com.stampaix.app');
  expect(config.ios.bundleIdentifier).toBe('com.stampaix.app');
  expect(config.ios.usesAppleSignIn).toBe(true);
  expect(config.ios.entitlements['com.apple.developer.applesignin']).toEqual([
    'Default',
  ]);
  expect(config.ios.associatedDomains).toEqual(['applinks:stampaix.com']);
}

describe('environment-aware Expo notification configuration', () => {
  test('production selects the production APNs mode and preserves config', () => {
    const config = withEnvironmentAwareNotifications(baseConfig, 'production');
    const [, options] = getNotificationsPlugin(config);

    expect(options).toEqual({
      icon: NOTIFICATION_ICON_PATH,
      color: '#2F6BFF',
      defaultChannel: 'default',
      mode: 'production',
    });
    expectCanonicalIdentityAndCapabilities(config);
  });

  test('non-production selects the development APNs mode', () => {
    const config = withEnvironmentAwareNotifications(baseConfig, 'development');
    const [, options] = getNotificationsPlugin(config);

    expect(options).toEqual({
      icon: NOTIFICATION_ICON_PATH,
      color: '#2F6BFF',
      defaultChannel: 'default',
      mode: 'development',
    });
    expect(options.mode).not.toBe('production');
    expectCanonicalIdentityAndCapabilities(config);
  });

  test('Android requests only required runtime permissions and blocks broad storage access', () => {
    expect(baseConfig.android.permissions).toEqual([
      'android.permission.CAMERA',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ]);
    expect(baseConfig.android.permissions).not.toContain(
      'android.permission.READ_MEDIA_IMAGES'
    );
    expect(baseConfig.android.blockedPermissions).toEqual([
      'android.permission.RECORD_AUDIO',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
    ]);
  });

  test('native plugins suppress unused photo, microphone, and Face ID declarations', () => {
    const [, secureStoreOptions] = getPlugin(
      baseConfig,
      'expo-secure-store'
    );
    const [, cameraOptions] = getPlugin(baseConfig, 'expo-camera');
    const [, imagePickerOptions] = getPlugin(
      baseConfig,
      'expo-image-picker'
    );

    expect(secureStoreOptions).toEqual({ faceIDPermission: false });
    expect(cameraOptions).toEqual({
      cameraPermission:
        'StampAix uses the camera to scan customer and business QR codes.',
      microphonePermission: false,
      recordAudioAndroid: false,
    });
    expect(imagePickerOptions).toEqual({
      photosPermission: false,
      microphonePermission: false,
    });
    expect(
      baseConfig.ios.infoPlist.NSPhotoLibraryUsageDescription
    ).toBeUndefined();
    expect(baseConfig.ios.infoPlist.NSCameraUsageDescription).toBe(
      'StampAix uses the camera to scan customer and business QR codes.'
    );
    expect(baseConfig.ios.infoPlist.NSLocationWhenInUseUsageDescription).toBe(
      'StampAix uses your location to show nearby participating businesses.'
    );
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

  test('Android notification icon is a transparent white 96px PNG', () => {
    const [, options] = getNotificationsPlugin(baseConfig);

    expect(options.icon).toBe(NOTIFICATION_ICON_PATH);
    expect(existsSync(notificationIconUrl)).toBe(true);

    const { width, height, pixels } = readRgbaPng(notificationIconUrl);
    let transparentPixels = 0;
    let visiblePixels = 0;
    let nonWhiteVisiblePixels = 0;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3];
      if (alpha < 255) {
        transparentPixels += 1;
      }
      if (alpha === 0) {
        continue;
      }

      visiblePixels += 1;
      if (
        pixels[offset] !== 255 ||
        pixels[offset + 1] !== 255 ||
        pixels[offset + 2] !== 255
      ) {
        nonWhiteVisiblePixels += 1;
      }
    }

    expect({ width, height }).toEqual({ width: 96, height: 96 });
    expect(transparentPixels).toBeGreaterThan(0);
    expect(visiblePixels).toBeGreaterThan(0);
    expect(visiblePixels).toBeLessThan(width * height);
    expect(nonWhiteVisiblePixels).toBe(0);
  });
});
