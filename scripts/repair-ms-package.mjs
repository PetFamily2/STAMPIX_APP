import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const nodeModulesRoot = path.join(projectRoot, 'node_modules');

const sourceIndexPath = path.join(nodeModulesRoot, 'ms', 'index.js');

if (!fs.existsSync(sourceIndexPath)) {
  process.exit(0);
}

if (!fs.existsSync(nodeModulesRoot)) {
  process.exit(0);
}

let repairedCount = 0;
let patchedReactNativeFiles = 0;
let repairedReactRefresh = 0;

function maybeRepairMsPackage(msDirPath) {
  const targetPackagePath = path.join(msDirPath, 'package.json');
  const targetIndexPath = path.join(msDirPath, 'index.js');

  if (!fs.existsSync(targetPackagePath) || fs.existsSync(targetIndexPath)) {
    return;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(targetPackagePath, 'utf8'));
    if (packageJson?.name !== 'ms') {
      return;
    }

    fs.copyFileSync(sourceIndexPath, targetIndexPath);
    repairedCount += 1;
  } catch (error) {
    console.warn(`Failed to repair nested ms package at ${msDirPath}:`, error);
  }
}

function walkNodeModules(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);
    if (entry.name === '.bin') {
      continue;
    }

    if (entry.name === 'ms' && path.basename(path.dirname(entryPath)) === 'node_modules') {
      maybeRepairMsPackage(entryPath);
      continue;
    }

    walkNodeModules(entryPath);
  }
}

walkNodeModules(nodeModulesRoot);

if (repairedCount > 0) {
  console.log(`Repaired ${repairedCount} nested ms package(s) for Metro tooling.`);
}

function hasReactRefreshRuntimeFiles(reactRefreshDirPath) {
  const requiredPaths = ['babel.js', 'runtime.js', path.join('cjs', 'react-refresh-runtime.development.js')];
  return requiredPaths.every((relativePath) =>
    fs.existsSync(path.join(reactRefreshDirPath, relativePath))
  );
}

function repairRootReactRefreshPackage() {
  const rootReactRefreshPath = path.join(nodeModulesRoot, 'react-refresh');
  const rootPackagePath = path.join(rootReactRefreshPath, 'package.json');

  if (!fs.existsSync(rootPackagePath) || hasReactRefreshRuntimeFiles(rootReactRefreshPath)) {
    return;
  }

  const candidateSourcePaths = [
    path.join(nodeModulesRoot, 'react-native', 'node_modules', 'react-refresh'),
    path.join(nodeModulesRoot, '@react-native', 'babel-preset', 'node_modules', 'react-refresh'),
    path.join(nodeModulesRoot, 'expo', 'node_modules', 'react-refresh'),
  ];

  const validSourcePath = candidateSourcePaths.find(
    (candidatePath) =>
      fs.existsSync(path.join(candidatePath, 'package.json')) &&
      hasReactRefreshRuntimeFiles(candidatePath)
  );

  if (!validSourcePath) {
    console.warn(
      'Unable to repair root react-refresh package (no valid source copy with runtime files found).'
    );
    return;
  }

  fs.cpSync(validSourcePath, rootReactRefreshPath, { recursive: true, force: true });
  repairedReactRefresh += 1;
}

repairRootReactRefreshPackage();

if (repairedReactRefresh > 0) {
  console.log('Repaired root react-refresh package files required by babel-preset-expo.');
}

function patchReactNativeTurboModule() {
  const turboModulePath = path.join(
    nodeModulesRoot,
    'react-native',
    'ReactCommon',
    'react',
    'nativemodule',
    'core',
    'platform',
    'ios',
    'ReactCommon',
    'RCTTurboModule.mm'
  );

  if (!fs.existsSync(turboModulePath)) {
    return;
  }

  const source = fs.readFileSync(turboModulePath, 'utf8');
  const alreadyPatchedPattern =
    /@catch \(NSException \*exception\) \{\r?\n\s*if \(shouldVoidMethodsExecuteSync_\) \{/m;

  if (alreadyPatchedPattern.test(source)) {
    return;
  }

  const originalPattern =
    /@catch \(NSException \*exception\) \{\r?\n\s*throw convertNSExceptionToJSError\(runtime, exception, std::string\{moduleName\}, methodNameStr\);\r?\n\s*\} @finally \{/m;

  const replacement = [
    '@catch (NSException *exception) {',
    '      if (shouldVoidMethodsExecuteSync_) {',
    '        throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);',
    '      } else {',
    '        @throw exception;',
    '      }',
    '    } @finally {',
  ].join('\n');

  if (!originalPattern.test(source)) {
    console.warn(
      'Unable to patch RCTTurboModule.mm automatically (expected pattern not found).'
    );
    return;
  }

  const patched = source.replace(originalPattern, replacement);
  fs.writeFileSync(turboModulePath, patched, 'utf8');
  patchedReactNativeFiles += 1;
}

patchReactNativeTurboModule();

if (patchedReactNativeFiles > 0) {
  console.log(
    `Patched ${patchedReactNativeFiles} React Native TurboModule file(s) for iOS async NSException handling.`
  );
}
