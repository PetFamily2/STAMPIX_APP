import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  planConfig,
  REQUIRED_PLAN_BY_CANONICAL_FEATURE,
} from '../../convex/lib/billing/productionContract';
import {
  BUSINESS_WEB_ROUTES,
  isBusinessWebRouteActive,
} from '../businessWebNavigation';
import {
  buildWebTeamLockedCopy,
  resolveWebTeamLockedRequiredPlan,
} from '../subscription/webTeamLockedState';

const read = (path) => readFileSync(path, 'utf8');

describe('business web phase 3b route contracts', () => {
  test('all launch Business Web destinations are real Expo Router routes', () => {
    expect(BUSINESS_WEB_ROUTES).toEqual({
      dashboard: '/business',
      customers: '/business/customers',
      loyalty: '/business/loyalty',
      analytics: '/business/analytics',
      team: '/business/team',
      billing: '/business/billing',
      settings: '/business/settings',
    });
    expect(existsSync('app/(web-business)/business/index.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/customers.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/loyalty.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/analytics.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/team.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/billing.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/settings.tsx')).toBe(true);

    const layout = read('app/(web-business)/business/_layout.tsx');
    expect(layout).toContain('BusinessWebShellRoute');
    expect(layout).toContain('<Slot />');
  });

  test('active navigation follows pathname and launch modules have hrefs', () => {
    expect(isBusinessWebRouteActive('/business', '/business')).toBe(true);
    expect(isBusinessWebRouteActive('/business/team', '/business')).toBe(false);
    expect(
      isBusinessWebRouteActive('/business/team/member', '/business/team')
    ).toBe(true);
    expect(
      isBusinessWebRouteActive('/business/settings', '/business/team')
    ).toBe(false);

    const shell = read('components/business-web/BusinessWebShell.tsx');
    expect(shell).toContain('isBusinessWebRouteActive');
    for (const key of [
      'dashboard',
      'customers',
      'loyalty',
      'analytics',
      'team',
      'billing',
      'settings',
    ]) {
      expect(shell).toContain(`BUSINESS_WEB_ROUTES.${key}`);
    }
    expect(shell).toContain('const isDisabled = !item.href');
  });
});

describe('business web team locked plan', () => {
  test('team minimum required plan is Pro and Premium is not the minimum', () => {
    expect(REQUIRED_PLAN_BY_CANONICAL_FEATURE.team).toBe('pro');
    expect(planConfig.starter.features.team).toBe(false);
    expect(planConfig.pro.features.team).toBe(true);
    expect(planConfig.premium.features.team).toBe(true);

    const requiredPlan = resolveWebTeamLockedRequiredPlan({
      featureRequiredPlan: REQUIRED_PLAN_BY_CANONICAL_FEATURE.team,
      gateRequiredPlan: 'premium',
      gateReason: 'subscription_inactive',
    });
    const copy = buildWebTeamLockedCopy(requiredPlan);

    expect(requiredPlan).toBe('pro');
    expect(copy.description).toBe('ניהול צוות זמין במסלול Pro ומעלה.');
    expect(copy.description).not.toContain('Premium');
    expect(copy.detail).toBe('שדרוג המסלול יהיה זמין דרך StampAix Business.');
    expect(`${copy.description}\n${copy.detail}`).not.toMatch(
      /App Store|Google Play|PayPlus|אפליקציה|אתר הניהול/
    );
  });

  test('a feature-locked gate agrees with the canonical Pro minimum', () => {
    expect(
      resolveWebTeamLockedRequiredPlan({
        featureRequiredPlan: 'pro',
        gateRequiredPlan: 'pro',
        gateReason: 'feature_locked',
      })
    ).toBe('pro');
    expect(
      buildWebTeamLockedCopy(
        resolveWebTeamLockedRequiredPlan({
          featureRequiredPlan: null,
          gateRequiredPlan: 'premium',
          gateReason: 'subscription_inactive',
        })
      ).description
    ).not.toContain('Premium');
  });
});

describe('business web team contracts', () => {
  const team = read('components/business-web/BusinessWebTeam.tsx');

  test('uses existing backend team APIs and email invite only', () => {
    expect(team).toContain('api.business.listBusinessStaff');
    expect(team).toContain('api.business.listPendingStaffInvites');
    expect(team).toContain('api.business.getBusinessTeamSummary');
    expect(team).toContain('api.business.listBusinessStaffHistory');
    expect(team).toContain('api.business.inviteBusinessStaff)');
    expect(team).toContain('api.business.cancelStaffInvite');
    expect(team).toContain('api.business.updateBusinessStaffRole');
    expect(team).toContain('api.business.suspendBusinessStaff');
    expect(team).toContain('api.business.reactivateBusinessStaff');
    expect(team).toContain('api.business.removeBusinessStaff');
    expect(team).not.toContain('inviteBusinessStaffByScanToken');
    expect(team).not.toContain('QrScanner');
    expect(team).not.toContain('expo-camera');
  });

  test('preserves team permission, entitlement, roles, seats, and statuses', () => {
    expect(team).toContain('capabilities?.manage_team === true');
    expect(team).toContain("const teamGate = gate('team')");
    expect(team).toContain('resolveWebTeamLockedRequiredPlan');
    expect(team).toContain('requiredPlanMap?.byFeature?.team');
    expect(team).toContain('buildWebTeamLockedCopy');
    expect(team).not.toContain('אין רכישה מתוך אתר הניהול');
    expect(team).not.toContain('מסך המנוי באפליקציה');
    expect(team).not.toContain('App Store');
    expect(team).not.toContain('Google Play');
    expect(team).not.toContain('PayPlus');
    expect(team).toContain('summary.usedSeats >= maxSeats');
    expect(team).toContain("owner: 'בעלים'");
    expect(team).toContain("manager: 'מנהל'");
    expect(team).toContain("staff: 'עובד'");
    expect(team).toContain("suspended: 'מושעה'");
    expect(team).toContain("member.staffRole === 'owner'");
    expect(team).toContain("actorRole === 'owner'");
  });

  test('switches the management table to cards and confirms destructive actions', () => {
    expect(team).toContain('const showTable = width >= 1240');
    expect(team).toContain('styles.table');
    expect(team).toContain('styles.memberCard');
    expect(team).toContain('BusinessWebConfirmDialog');
    expect(team).toContain("kind: 'suspend' | 'remove'");
    expect(team).toContain('accessibilityState={{');
  });
});

describe('business web profile contracts', () => {
  const settings = read('components/business-web/BusinessWebSettings.tsx');
  const profileHook = read('hooks/useBusinessSettingsProfile.ts');

  test('uses profile and address APIs with edit permission and conflict protection', () => {
    expect(settings).toContain('useBusinessSettingsProfile');
    expect(settings).toContain('profile.canEditBusiness');
    expect(settings).toContain('profile.conflictLocked');
    expect(settings).toContain('BusinessAddressSelector');
    expect(profileHook).toContain('api.business.getBusinessSettings');
    expect(profileHook).toContain('api.business.updateBusinessProfile');
    expect(profileHook).toContain('api.business.updateBusinessAddress');
    expect(profileHook).toContain('expectedUpdatedAt:');
    expect(profileHook).toContain('getEditConflictError');
  });

  test('renders only daily profile fields, not onboarding research fields', () => {
    expect(settings).toContain('draft.name');
    expect(settings).toContain('draft.shortDescription');
    expect(settings).toContain('draft.businessPhone');
    expect(settings).toContain('draft.serviceTypes');
    expect(settings).toContain('draft.serviceTags');
    expect(settings).toContain('BusinessAddressSelector');
    expect(settings).not.toContain('discoverySource');
    expect(settings).not.toContain('ownerAgeRange');
    expect(settings).not.toContain('birthdayCampaignRelevant');
  });

  test('isolates drafts by active business and guards dirty navigation', () => {
    expect(settings).toContain('settings.businessId !== activeBusinessId');
    expect(settings).toContain('hydratedBusinessRef');
    expect(settings).toContain('String(activeBusinessId)');
    expect(settings).toContain('addressRevision');
    expect(settings).toContain('useBusinessWebUnsavedChanges');
    expect(settings).toContain('dirtyProfileDocumentFields');
    expect(settings).toContain('isProfileAddressDirty');
    expect(profileHook).toContain('settings.businessId !== activeBusinessId');
  });
});

describe('phase 3a regression boundaries', () => {
  test('dashboard and web auth routes remain connected to their existing contracts', () => {
    const dashboardRoute = read('app/(web-business)/business/index.tsx');
    const dashboard = read('components/business-web/BusinessWebDashboard.tsx');
    const authLayout = read('app/(web-business)/business/_layout.tsx');

    expect(dashboardRoute).toContain('BusinessWebDashboard');
    expect(dashboard).toContain('api.dashboard.getBusinessDashboardSummary');
    expect(authLayout).toContain("resolveBusinessSignedOutHref('web')");
    expect(authLayout).toContain('useConvexAuth');
  });
});
