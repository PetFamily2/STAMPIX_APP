import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const rows = [];
function scan(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory()) scan(p);
    else if (/\.tsx$/.test(p)) {
      const s = readFileSync(p, 'utf8');
      if (
        !/TextInput|<input|<textarea|<select|useMutation\(|useAction\(/.test(s)
      )
        continue;
      const ast = ts.createSourceFile(p, s, 99, true, ts.ScriptKind.TSX);
      const writes = [];
      function visit(n) {
        if (
          ts.isCallExpression(n) &&
          /^(useMutation|useAction)$/.test(n.expression.getText(ast))
        )
          writes.push(n.arguments[0]?.getText(ast));
        ts.forEachChild(n, visit);
      }
      visit(ast);
      const inputs = /TextInput|<input|<textarea|<select/.test(s);
      const shared = /useBusinessWebUnsavedChanges\(/.test(s),
        navigation = /usePreventRemove\(/.test(s),
        version =
          /expectedUpdatedAt|expectedConfigVersion|expectedDocument/.test(s);
      rows.push({
        file: p,
        input: inputs,
        writes,
        sharedGuard: shared,
        navigationGuard: navigation,
        versionArgument: version,
        serverHydration: /useEffect\(/.test(s),
        classification:
          inputs && writes.length
            ? 'persistent-input'
            : inputs
              ? 'input-or-delegated-form'
              : 'action-or-delegated-write',
        decision:
          inputs && writes.length
            ? `Persistent editor/action input. ${shared ? 'Shared Web/PWA guard present.' : 'No direct shared Web/PWA guard; parent coverage must be proven before claiming protection.'} ${navigation ? 'Route removal guard present.' : 'No direct route removal guard.'} ${version ? 'Version argument present.' : 'No direct optimistic version argument; concurrent existing-record edits are not proven safe.'}`
            : inputs
              ? 'Search/auth/scanner or delegated input: no direct persistence hook. Parent owns saving; no automatic blanket guard added.'
              : 'Writes are immediate actions or delegated forms; no direct text editor. Confirmations and server authorization remain authoritative.',
      });
    }
  }
}
for (const dir of ['app', 'screens', 'components', 'hooks']) scan(dir);
writeFileSync(
  'docs/audits/STAGE2_FORM_INVENTORY.json',
  JSON.stringify(rows, null, 2) + '\n'
);
writeFileSync(
  'docs/audits/STAGE2_FORM_INVENTORY.md',
  '# Persistent-form and action inventory\n\nStatic evidence for every TSX input or direct mutation/action surface in app, screens, components and hooks. A missing direct guard may be supplied by a parent; this inventory does not assert such coverage. Search/auth/scanner inputs are excluded from blanket dirty guarding. Existing-record writes without optimistic versions remain known code gaps, not device-only gates. Renderer acceptance below covers two main screens only.\n\n| Surface | Classification | Writes | Web/PWA guard | Navigation | Version argument | Decision |\n|---|---|---|---|---|---|---|\n' +
    rows
      .map(
        (r) =>
          `| ${r.file} | ${r.classification} | ${r.writes.join(', ')} | ${r.sharedGuard} | ${r.navigationGuard} | ${r.versionArgument} | ${r.decision} |`
      )
      .join('\n') +
    '\n'
);
console.log(
  `Mapped ${rows.length} input/write surfaces; ${rows.filter((r) => r.classification === 'persistent-input').length} direct persistent-input surfaces.`
);
