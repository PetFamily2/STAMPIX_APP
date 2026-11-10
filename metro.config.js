const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const {
  createWebIconResolver,
} = require('./scripts/lib/web-icon-resolver.cjs');

const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = createWebIconResolver(
  config.resolver.resolveRequest,
  require.resolve('./lib/web-icons/lucide.web.js'),
  require.resolve('./lib/web-icons/expo.web.js')
);

module.exports = withNativeWind(config, { input: './global.css' });
