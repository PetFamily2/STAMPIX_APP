import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const baseConfig = appJson.expo as ExpoConfig;
export const PRODUCTION_GOOGLE_SERVICES_FILE = './google-services.json';
export const PREVIEW_GOOGLE_SERVICES_FILE = './google-services.preview.json';
const NOTIFICATIONS_PLUGIN = 'expo-notifications';
const AUDIO_PLUGIN = 'expo-audio';
type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];
const AUDIO_PLAYBACK_ONLY_PLUGIN: ExpoPlugin = [
  AUDIO_PLUGIN,
  {
    microphonePermission: false,
    recordAudioAndroid: false,
    enableBackgroundRecording: false,
  },
];

function getAppEnvironment(): string | undefined {
  return process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
}

function normalizeConfigPath(value: string) {
  return value.trim().replaceAll('\\', '/');
}

export function isProductionGoogleServicesPath(value: string) {
  const normalized = normalizeConfigPath(value);
  if (!normalized) {
    return false;
  }
  if (
    normalized === PRODUCTION_GOOGLE_SERVICES_FILE ||
    normalized === 'google-services.json'
  ) {
    return true;
  }
  return resolve(normalized) === resolve(PRODUCTION_GOOGLE_SERVICES_FILE);
}

export function isPreviewGoogleServicesPath(value: string) {
  const normalized = normalizeConfigPath(value);
  if (!normalized) {
    return false;
  }
  if (
    normalized === PREVIEW_GOOGLE_SERVICES_FILE ||
    normalized === 'google-services.preview.json'
  ) {
    return true;
  }
  return resolve(normalized) === resolve(PREVIEW_GOOGLE_SERVICES_FILE);
}

export function resolveAndroidGoogleServicesFile(options?: {
  appEnvironment?: string;
  servicesPath?: string | null;
  fileExists?: (filePath: string) => boolean;
}): string | undefined {
  const appEnvironment = (options?.appEnvironment ?? getAppEnvironment())
    ?.trim()
    .toLowerCase();
  const fileExists = options?.fileExists ?? existsSync;
  const configured = normalizeConfigPath(
    options && 'servicesPath' in options
      ? (options.servicesPath ?? '')
      : (process.env.GOOGLE_SERVICES_JSON ?? '')
  );

  if (appEnvironment === 'production') {
    if (
      configured &&
      !isPreviewGoogleServicesPath(configured) &&
      fileExists(configured)
    ) {
      return configured;
    }
    if (fileExists(PRODUCTION_GOOGLE_SERVICES_FILE)) {
      return PRODUCTION_GOOGLE_SERVICES_FILE;
    }
    return undefined;
  }

  if (appEnvironment !== 'preview') {
    return undefined;
  }

  if (
    configured &&
    !isProductionGoogleServicesPath(configured) &&
    fileExists(configured)
  ) {
    return configured;
  }

  if (fileExists(PREVIEW_GOOGLE_SERVICES_FILE)) {
    return PREVIEW_GOOGLE_SERVICES_FILE;
  }

  return undefined;
}

function withEnvironmentAwareGoogleServicesFile(
  config: ExpoConfig
): ExpoConfig {
  const appEnvironment = getAppEnvironment();
  const googleServicesFile = resolveAndroidGoogleServicesFile({
    appEnvironment,
  });
  if (!googleServicesFile) {
    if (appEnvironment === 'production') {
      throw new Error('PRODUCTION_GOOGLE_SERVICES_FILE_MISSING');
    }
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
    },
  };
}

export function withEnvironmentAwareNotifications(
  config: ExpoConfig,
  appEnvironment = getAppEnvironment()
): ExpoConfig {
  const mode = appEnvironment === 'production' ? 'production' : 'development';

  return {
    ...config,
    plugins: config.plugins?.map((plugin): ExpoPlugin => {
      if (typeof plugin === 'string') {
        return plugin === NOTIFICATIONS_PLUGIN ? [plugin, { mode }] : plugin;
      }

      const [pluginName, pluginOptions] = plugin;
      if (pluginName !== NOTIFICATIONS_PLUGIN) {
        return plugin;
      }

      return [pluginName, { ...pluginOptions, mode }];
    }),
  };
}

function withGoogleMapsNativeKeys(config: ExpoConfig): ExpoConfig {
  const googleMapsAndroidApiKey =
    process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();

  if (!googleMapsAndroidApiKey) {
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: googleMapsAndroidApiKey,
        },
      },
    },
  };
}

function withUiSoundEffects(config: ExpoConfig): ExpoConfig {
  const plugins = config.plugins ?? [];
  const pluginsWithoutAudio = plugins.filter(
    (plugin) =>
      (typeof plugin === 'string' ? plugin : plugin[0]) !== AUDIO_PLUGIN
  );
  return {
    ...config,
    plugins: [...pluginsWithoutAudio, AUDIO_PLAYBACK_ONLY_PLUGIN],
  };
}

export default function defineConfig(_context: ConfigContext): ExpoConfig {
  return withUiSoundEffects(
    withGoogleMapsNativeKeys(
      withEnvironmentAwareNotifications(
        withEnvironmentAwareGoogleServicesFile(baseConfig)
      )
    )
  );
}
