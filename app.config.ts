import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const baseConfig = appJson.expo as ExpoConfig;
const PRODUCTION_GOOGLE_SERVICES_FILE = './google-services.json';

function withProductionGoogleServicesFile(config: ExpoConfig): ExpoConfig {
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();

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
  return withGoogleMapsNativeKeys(withProductionGoogleServicesFile(baseConfig));
}
