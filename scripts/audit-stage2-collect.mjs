import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const files = [
  'referrals',
  'dashboard',
  'events',
  'customerLifecycle',
  'customerCards',
  'loyaltyPrograms',
  'campaigns',
  'business',
];
const findings = [];
for (const name of files) {
  const file = `convex/${name}.ts`;
  const ast = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'collect'
    ) {
      let owner = node.parent;
      while (
        owner &&
        !ts.isFunctionDeclaration(owner) &&
        !ts.isVariableDeclaration(owner)
      )
        owner = owner.parent;
      findings.push({
        file,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        owner: owner?.name?.getText(ast) ?? '(anonymous)',
        expression: node.expression.expression.getText(ast),
        review: 'requires semantic and scale review; do not truncate results',
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
writeFileSync(
  'docs/audits/STAGE2_COLLECT_INVENTORY.json',
  `${JSON.stringify(findings, null, 2)}\n`
);
console.log(
  `Recorded ${findings.length} collect calls; semantic review remains required.`
);
