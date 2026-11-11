import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function routeIdentity(file) {
  return `/${file
    .replace(/^app\//, '')
    .replace(/\.(web|native|ios|android)\.[jt]sx?$/, '')
    .replace(/\.[jt]sx?$/, '')
    .replace(/\/(index|_layout)$/, '')}`;
}

export function publicRoute(route) {
  return (
    route
      .replace(/\/\([^/]+\)/g, '')
      .replace(/\/index$/, '')
      .replace(/\/$/, '') || '/'
  );
}

export function classifyRoute({ alias, navigation, imports, layout }) {
  if (alias) return 'COMPATIBILITY';
  if (navigation || imports || layout) return 'ACTIVE';
  return 'UNKNOWN'; // Missing a static reference never proves an Expo route orphan.
}

export function auditRoutes(root = process.cwd()) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  const sourceFiles = tracked.filter(
    (file) =>
      /\.[cm]?[jt]sx?$/.test(file) &&
      !file.includes('/_generated/') &&
      !/(^|\/)(__tests__|archive)\//.test(file)
  );
  const routes = tracked.filter((file) => /^app\/.*\.[jt]sx?$/.test(file));
  const evidence = new Map(
    routes.map((file) => [
      file,
      { navigation: [], imports: [], layout: [], dynamicCandidates: [] },
    ])
  );
  const routeKeys = new Map();
  for (const file of routes) {
    const identity = routeIdentity(file);
    const key = publicRoute(identity);
    routeKeys.set(file, { identity, publicPath: key });
  }
  const aliases = new Set();
  for (const file of sourceFiles) {
    const source = readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const hit = (node, kind) => ({
      file,
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      kind,
    });
    if (
      evidence.has(file) &&
      source.split('\n').length < 90 &&
      (/<Redirect\b/.test(source) ||
        /export\s*\{\s*default\s*\}\s*from/.test(source))
    )
      aliases.add(file);
    function visit(node) {
      if (ts.isStringLiteral(node)) {
        const value = node.text;
        const isModule =
          ts.isImportDeclaration(node.parent) ||
          ts.isExportDeclaration(node.parent);
        if (isModule && (value.startsWith('@/app/') || value.startsWith('.'))) {
          const target = value.startsWith('@/')
            ? value.slice(2)
            : path.posix.normalize(
                path.posix.join(path.posix.dirname(file), value)
              );
          for (const route of routes) {
            if (
              route.replace(/\.[jt]sx?$/, '') === target ||
              route === target ||
              route.replace(/\.(web|native|ios|android)\.[jt]sx?$/, '') ===
                target
            )
              evidence.get(route).imports.push(hit(node, 'module-reference'));
          }
        } else if (value.startsWith('/') && !value.startsWith('//')) {
          const exact = value.split(/[?#]/)[0].replace(/\/$/, '') || '/';
          const grouped = /\/\([^/]+\)/.test(exact);
          for (const [route, keys] of routeKeys) {
            if (route === file || /\/_layout\./.test(route)) continue;
            if ((grouped ? keys.identity : keys.publicPath) === exact)
              evidence
                .get(route)
                .navigation.push(hit(node, 'literal-route-reference'));
          }
        }
        if (
          file.includes('/_layout.') &&
          ts.isJsxAttribute(node.parent) &&
          node.parent.name.text === 'name'
        ) {
          const target = `${path.posix.dirname(file)}/${value}`;
          for (const route of routes) {
            const withoutExtension = route
              .replace(/\.(web|native|ios|android)\.[jt]sx?$/, '')
              .replace(/\.[jt]sx?$/, '');
            if (
              withoutExtension === target ||
              withoutExtension === `${target}/index` ||
              withoutExtension === `${target}/_layout`
            )
              evidence.get(route).layout.push(hit(node, 'layout-registration'));
          }
        }
      }
      if (ts.isTemplateExpression(node) && node.head.text.startsWith('/')) {
        const prefix = node.head.text;
        for (const [route, keys] of routeKeys) {
          if (
            keys.identity.startsWith(prefix) ||
            keys.publicPath.startsWith(prefix)
          )
            evidence
              .get(route)
              .dynamicCandidates.push(hit(node, 'dynamic-prefix-only'));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return {
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    method:
      'TypeScript AST references + Expo file/layout inventory; static evidence is not physical-device acceptance.',
    routes: routes.map((file) => {
      const refs = evidence.get(file);
      const layoutFile = /\/_layout\./.test(file);
      return {
        file,
        ...routeKeys.get(file),
        category: layoutFile
          ? 'COMPATIBILITY'
          : classifyRoute({
              alias: aliases.has(file),
              navigation: refs.navigation.length,
              imports: refs.imports.length,
              layout: refs.layout.length,
            }),
        evidence: refs,
      };
    }),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = auditRoutes();
  const counts = {};
  for (const route of report.routes)
    counts[route.category] = (counts[route.category] ?? 0) + 1;
  const directory = 'docs/audits';
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/ROUTE_INVENTORY_20261111.json`,
    `${JSON.stringify(report, null, 2)}\n`
  );
  const rows = report.routes.map(
    (route) =>
      `| \`${route.file}\` | ${route.category} | ${route.evidence.navigation.length} route / ${route.evidence.imports.length} import / ${route.evidence.layout.length} layout / ${route.evidence.dynamicCandidates.length} dynamic candidates |`
  );
  writeFileSync(
    `${directory}/ROUTE_INVENTORY_20261111.md`,
    `# Expo route inventory — 2026-11-11\n\nSource: ${report.sourceSha}. ${report.method}\n\nACTIVE means a static reference exists, not that manual UX passed. COMPATIBILITY includes route aliases and layout infrastructure. UNKNOWN requires dynamic/deep-link/manual investigation. No route is declared ORPHAN or safe to remove based on absence of imports. LEGACY requires a reviewed replacement, not just a Web alternative.\n\nCounts: ${JSON.stringify(counts)}.\n\n| File | Classification | Evidence |\n|---|---|---|\n${rows.join('\n')}\n`
  );
  console.log(JSON.stringify({ routeCount: report.routes.length, counts }));
}
