import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const baseConfig = appJson.expo as ExpoConfig;

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
  return withGoogleMapsNativeKeys(baseConfig);
}
