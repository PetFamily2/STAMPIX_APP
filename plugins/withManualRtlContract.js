const { withInfoPlist } = require('expo/config-plugins');

const SUPPORTS_RTL_KEY = 'ExpoLocalization_supportsRTL';
const FORCES_RTL_KEY = 'ExpoLocalization_forcesRTL';

/**
 * Keep StampAix on its manual-RTL architecture.
 *
 * expo-localization 17.0.8 treats the presence of the iOS forcesRTL key as
 * supportsRTL=true even when both plist values are false. Omitting only that
 * iOS key makes the module honor supportsRTL=false while the upstream plugin
 * can still write false/false to Android string resources.
 */
module.exports = function withManualRtlContract(config) {
  return withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults[SUPPORTS_RTL_KEY] = false;
    delete nextConfig.modResults[FORCES_RTL_KEY];
    return nextConfig;
  });
};
