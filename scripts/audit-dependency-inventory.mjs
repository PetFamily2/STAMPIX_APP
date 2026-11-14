import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Static evidence, not a claim that runtime-generated paths or external callers do not exist.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const source = files.filter(
  (file) =>
    /^(app|screens|components|hooks|contexts|lib|convex|scripts)\//.test(
      file
    ) &&
    /\.[cm]?[jt]sx?$/.test(file) &&
    !file.includes('/_generated/')
);
const imports = [];
const dynamic = [];
for (const file of source) {
  const text = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const record = (node, kind, value) => ({
    file,
    line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
    kind,
    value,
  });
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(record(node, 'module', node.moduleSpecifier.text));
    }
    if (ts.isCallExpression(node)) {
      const target = node.expression.getText(ast);
      if (
        target === 'require' ||
        target === 'import' ||
        /^(router\.(push|replace|navigate)|Linking\.(openURL|createURL)|require\.resolve)$/.test(
          target
        )
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg))
          imports.push(record(node, target, arg.text));
        else dynamic.push(record(node, target, arg?.getText(ast) ?? ''));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const configs = files.filter(
  (file) =>
    /^\.github\/workflows\//.test(file) ||
    /^(package\.json|app\.json|app\.config\.ts|eas\.json|metro\.config\.(js|cjs)|babel\.config\.js|tsconfig\.json|convex\.json)$/.test(
      file
    )
);
const scriptFiles = files.filter((file) => file.startsWith('scripts/'));
const references = [];
for (const file of configs) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const script of scriptFiles) {
      if (line.includes(script))
        references.push({ file, line: index + 1, script });
    }
  });
}
const result = {
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  scope:
    'Tracked application source, scripts and build/workflow configurations. Dynamic expressions and external callers require conservative retention.',
  sourceFiles: source,
  configs,
  scriptFiles,
  packageScripts: packageJson.scripts,
  dependencies: Object.keys(packageJson.dependencies ?? {}).sort(),
  devDependencies: Object.keys(packageJson.devDependencies ?? {}).sort(),
  imports,
  dynamic,
  buildScriptReferences: references,
};
writeFileSync(
  'docs/audits/STAGE1_DEPENDENCY_INVENTORY.json',
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(
  JSON.stringify({
    sourceFiles: source.length,
    configs: configs.length,
    scripts: scriptFiles.length,
    imports: imports.length,
    dynamic: dynamic.length,
    buildScriptReferences: references.length,
  })
);
