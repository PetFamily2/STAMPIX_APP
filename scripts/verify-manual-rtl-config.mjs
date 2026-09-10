import path from 'node:path';
import configPlugins from '@expo/config-plugins';
import prebuildConfig from '@expo/prebuild-config';

const { compileModsAsync } = configPlugins;
const { getPrebuildConfigAsync } = prebuildConfig;

const LOCALIZATION_PLUGIN = 'expo-localization';
const MANUAL_RTL_PLUGIN = './plugins/withManualRtlContract';
const SUPPORTS_RTL_KEY = 'ExpoLocalization_supportsRTL';
const FORCES_RTL_KEY = 'ExpoLocalization_forcesRTL';

function fail(message) {
  // biome-ignore lint/suspicious/noConsole: build verifier reports actionable failures.
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pluginName(plugin) {
  return typeof plugin === 'string' ? plugin : plugin?.[0];
}

function readAndroidString(strings, name) {
  const matches = strings.filter((entry) => entry?.$?.name === name);
  if (matches.length !== 1) {
    fail(`Expected exactly one Android string resource named ${name}.`);
  }
  return matches[0]._;
}

async function verify() {
  const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
  const result = await getPrebuildConfigAsync(projectRoot, {
    platforms: ['ios', 'android'],
  });
  const { exp } = result;

  await compileModsAsync(exp, {
    projectRoot,
    introspect: true,
    platforms: ['ios', 'android'],
    assertMissingModProviders: false,
  });

  const plugins = exp.plugins ?? [];
  const localizationIndex = plugins.findIndex(
    (plugin) => pluginName(plugin) === LOCALIZATION_PLUGIN
  );
  const contractIndex = plugins.findIndex(
    (plugin) => pluginName(plugin) === MANUAL_RTL_PLUGIN
  );

  if (localizationIndex < 0) {
    fail(`Missing ${LOCALIZATION_PLUGIN} config plugin.`);
  }
  if (contractIndex <= localizationIndex) {
    fail(
      MANUAL_RTL_PLUGIN +
        ' must run after ' +
        LOCALIZATION_PLUGIN +
        ' so its iOS plist correction is final.'
    );
  }

  const localizationOptions = Array.isArray(plugins[localizationIndex])
    ? plugins[localizationIndex][1]
    : null;
  if (
    localizationOptions?.supportsRTL !== false ||
    localizationOptions?.forcesRTL !== false
  ) {
    fail(
      LOCALIZATION_PLUGIN +
        ' must declare supportsRTL=false and forcesRTL=false.'
    );
  }

  const modResults = exp._internal?.modResults;
  const iosInfoPlist = modResults?.ios?.infoPlist;
  const androidStrings = modResults?.android?.strings?.resources?.string;

  if (!iosInfoPlist || !Array.isArray(androidStrings)) {
    fail('Could not introspect the generated iOS plist and Android strings.');
  }
  if (iosInfoPlist[SUPPORTS_RTL_KEY] !== false) {
    fail(`Generated iOS ${SUPPORTS_RTL_KEY} must be false.`);
  }
  if (Object.hasOwn(iosInfoPlist, FORCES_RTL_KEY)) {
    fail(
      'Generated iOS ' +
        FORCES_RTL_KEY +
        ' must be absent; expo-localization 17.0.8 misreads even a false value as supportsRTL=true.'
    );
  }

  for (const forbiddenKey of [
    'AppleLanguages',
    'CFBundleLocalizations',
    'UISemanticContentAttribute',
  ]) {
    if (Object.hasOwn(iosInfoPlist, forbiddenKey)) {
      fail(`Generated iOS Info.plist must not contain ${forbiddenKey}.`);
    }
  }

  if (readAndroidString(androidStrings, SUPPORTS_RTL_KEY) !== 'false') {
    fail(`Generated Android ${SUPPORTS_RTL_KEY} must be false.`);
  }
  if (readAndroidString(androidStrings, FORCES_RTL_KEY) !== 'false') {
    fail(`Generated Android ${FORCES_RTL_KEY} must be false.`);
  }

  // biome-ignore lint/suspicious/noConsole: build verifier reports pass/fail status.
  console.log(
    'Manual RTL native config verified (iOS support=false/force key absent; Android support=false/force=false).'
  );
}

verify().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
