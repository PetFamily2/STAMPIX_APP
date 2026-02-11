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
