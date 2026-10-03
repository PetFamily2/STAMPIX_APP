import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('admin web foundation', () => {
  test('admin route is web-only and fails closed for non-admin users', () => {
    const layout = read('app/(web-admin)/admin/_layout.tsx');
    expect(layout).toContain("Platform.OS !== 'web'");
    expect(layout).toContain('sessionContext?.isAdmin !== true');
    expect(layout).toContain('resolveBusinessSignedOutHref');
  });

  test('admin Convex queries require system-admin authority', () => {
    const source = read('convex/adminWeb.ts');
    expect(source).toContain('requireCurrentUser');
    expect(source).toContain('user.isAdmin !== true');
    expect(source).toContain("throw new Error('ADMIN_REQUIRED')");
    expect(source).toContain('await requireSystemAdmin(ctx)');
  });

  test('launch admin surfaces stay read-only', () => {
    const surfaces = [
      'components/admin-web/AdminWebDashboard.tsx',
      'components/admin-web/AdminBusinessSearch.tsx',
      'components/admin-web/AdminBusinessDetail.tsx',
      'components/admin-web/AdminBillingQueue.tsx',
      'components/admin-web/AdminSupportQueue.tsx',
      'components/admin-web/AdminDeletionQueue.tsx',
    ];

    for (const path of surfaces) {
      const source = read(path);
      expect(source).not.toContain('useMutation');
      expect(source).not.toContain('useAction');
    }

    const backend = read('convex/adminWeb.ts');
    expect(backend).not.toContain('mutation({');
    expect(backend).not.toContain('action({');

    const shell = read('components/admin-web/AdminWebShell.tsx');
    expect(shell).toContain('כלים תפעוליים לקריאה בלבד');
  });

  test('admin exposes operational queues without privileged writes', () => {
    const backend = read('convex/adminWeb.ts');
    expect(backend).toContain('getBillingAttention');
    expect(backend).toContain('getSupportQueue');
    expect(backend).toContain('getDeletionQueue');
    expect(read('app/(web-admin)/admin/billing.tsx')).toContain(
      'AdminBillingQueue'
    );
    expect(read('app/(web-admin)/admin/support.tsx')).toContain(
      'AdminSupportQueue'
    );
    expect(read('app/(web-admin)/admin/deletions.tsx')).toContain(
      'AdminDeletionQueue'
    );
  });
});
