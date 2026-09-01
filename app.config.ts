import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const baseConfig = appJson.expo as ExpoConfig;
const PRODUCTION_GOOGLE_SERVICES_FILE = './google-services.json';
const NOTIFICATIONS_PLUGIN = 'expo-notifications';
type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

function getAppEnvironment(): string | undefined {
  return process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
}

function withProductionGoogleServicesFile(config: ExpoConfig): ExpoConfig {
  const appEnvironment = getAppEnvironment();

  if (appEnvironment !== 'production') {
    return config;
  }

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: PRODUCTION_GOOGLE_SERVICES_FILE,
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

export default function defineConfig(_context: ConfigContext): ExpoConfig {
  return withGoogleMapsNativeKeys(
    withEnvironmentAwareNotifications(
      withProductionGoogleServicesFile(baseConfig)
    )
  );
}
