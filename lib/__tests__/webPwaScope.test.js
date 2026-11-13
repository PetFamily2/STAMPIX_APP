import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CARD = 'app/(authenticated)/card/[membershipId]';

describe('UI-001 Web and PWA scope', () => {
  test('the shared Native card stays byte-equivalent to the approved baseline', () => {
    const source = Buffer.from(
      readFileSync(`${CARD}.tsx`, 'utf8').replace(/\r\n/g, '\n')
    );
    const blob = createHash('sha1')
      .update(`blob ${source.length}\0`)
      .update(source)
      .digest('hex');
    expect(blob).toBe('283346cfac5bb0394437deca9bec7c8b30a379e2');
  });

  test('the Web card contains the archived-card fix without replacing the shared route', () => {
    const web = readFileSync(`${CARD}.web.tsx`, 'utf8');
    expect(web).toContain("membership?.programLifecycle === 'archived'");
    expect(web).toContain('!isArchived ? (');
    expect(web).toContain('api.memberships.getMembershipActivity');
    const entry = readFileSync(
      'app/(authenticated)/(customer)/customer-card/[membershipId].tsx',
      'utf8'
    );
    expect(entry).toContain(
      "export { default } from '../../card/[membershipId]'"
    );
  });

  test('safe CI builds only Web/PWA and does not invoke a Native export or deployment', () => {
    const workflow = readFileSync(
      '.github/workflows/agent-safe-verify.yml',
      'utf8'
    );
    expect(workflow).toContain('expo export --platform web');
    expect(workflow).not.toMatch(/--platform\s+(all|ios|android)\b/);
    expect(workflow).not.toContain('verify:rtl-native-config');
    expect(workflow).not.toMatch(/\beas\s+(build|deploy|submit|update)\b/);
    expect(workflow).not.toMatch(/\bconvex\s+(dev|deploy)\b/);
    expect(workflow).not.toMatch(/\$\{\{[^}]*\bsecrets\s*(?:\.|\[)/);
    expect(workflow).toContain('finalize-web-pwa-export.mjs');
    expect(workflow).toContain('persist-credentials: false');
  });
});
