import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('admin web foundation', () => {
  test('admin route is web-only and fails closed for non-admin users', () => {
    const layout = readFileSync('app/(web-admin)/admin/_layout.tsx', 'utf8');
    expect(layout).toContain("Platform.OS !== 'web'");
    expect(layout).toContain('sessionContext?.isAdmin !== true');
    expect(layout).toContain('resolveBusinessSignedOutHref');
  });

  test('admin Convex query requires system-admin authority', () => {
    const source = readFileSync('convex/adminWeb.ts', 'utf8');
    expect(source).toContain('requireCurrentUser');
    expect(source).toContain('user.isAdmin !== true');
    expect(source).toContain("throw new Error('ADMIN_REQUIRED')");
  });

  test('launch admin surface is read-only and does not expose billing mutations', () => {
    const dashboard = readFileSync(
      'components/admin-web/AdminWebDashboard.tsx',
      'utf8'
    );
    const backend = readFileSync('convex/adminWeb.ts', 'utf8');
    expect(dashboard).not.toContain('useMutation');
    expect(dashboard).not.toContain('useAction');
    expect(backend).not.toContain('mutation({');
    expect(backend).not.toContain('action({');
    expect(dashboard).toContain('מרכז תפעול לקריאה בלבד');
  });
});
