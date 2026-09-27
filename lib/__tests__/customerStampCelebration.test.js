import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  shouldRedirectAwayFromOwnCustomerCard,
  shouldWaitForOwnCustomerCardOwnership,
} from '../customer/customerCardAccess';
import {
  buildCustomerCardCompletedContext,
  buildCustomerStampAddedMessage,
  CUSTOMER_CARD_COMPLETED_CELEBRATION_DURATION_MS,
  CUSTOMER_CARD_COMPLETED_SUBTITLE,
  CUSTOMER_CARD_COMPLETED_TITLE,
  CUSTOMER_STAMP_ADDED_TITLE,
  CUSTOMER_STAMP_CELEBRATION_DURATION_MS,
  CUSTOMER_STAMP_CONSUMED_EVENT_LIMIT,
  CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS,
  classifyCustomerStampCelebrationKind,
  clearCustomerStampNavigationTarget,
  createCustomerStampCelebrationTracker,
  customerStampEventId,
  getCustomerStampCelebrationSessionEpoch,
  noteCustomerStampNavigationTarget,
  observeCustomerStampCelebrationChannel,
  publishCustomerStampCelebrations,
  readCustomerStampCelebrationSessionUserId,
  readCustomerStampPresentation,
  reduceCustomerStampCelebration,
  resetCustomerStampCelebrationSessionForTests,
  syncCustomerStampCelebrationSession,
  takeCustomerStampPresentationFeedback,
} from '../customer/customerStampCelebration';
import {
  readCustomerStampCelebrationArmSnapshot,
  requestCustomerStampCelebrationArm,
} from '../customer/customerStampCelebrationArm';

const QR_SOURCE = 'app/(authenticated)/(customer)/show-qr.tsx';
const CARD_SOURCE = 'app/(authenticated)/card/[membershipId].tsx';
const AUTHENTICATED_LAYOUT = 'app/(authenticated)/_layout.tsx';
const CUSTOMER_LAYOUT = 'app/(authenticated)/(customer)/_layout.tsx';
const STAMP_HOST = 'components/customer/CustomerStampCelebrationHost.tsx';
const STAMP_LIB = 'lib/customer/customerStampCelebration.ts';
const REDEMPTION_HOST = 'components/customer/RedemptionCelebrationHost.tsx';
const REDEMPTION_VIEW = 'components/customer/RedemptionCelebration.tsx';
const POS_CELEBRATION = 'components/scanner/PosRedemptionCelebration.tsx';
const ROLE_GUARD = 'lib/hooks/useRoleGuard.ts';

function readSource(path) {
  return readFileSync(path, 'utf8');
}

function membership(overrides = {}) {
  return {
    membershipId: 'membership_1',
    lastStampAt: 500,
    currentStamps: 2,
    maxStamps: 8,
    businessName: 'קפה הבוקר',
    programTitle: 'כרטיסיית קפה',
    rewardName: 'קפה חינם',
    ...overrides,
  };
}

function reduceStep(tracker, overrides = {}) {
  return reduceCustomerStampCelebration(tracker, {
    memberships: [membership()],
    serverArmedAt: 1_000,
    serverArmFailed: false,
    ...overrides,
  });
}

describe('customer stamp celebration session', () => {
  beforeEach(() => {
    resetCustomerStampCelebrationSessionForTests();
  });

  test('one new stamp event produces one celebration', () => {
    const hydrated = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
    });
    expect(hydrated.celebrations).toEqual([]);

    const stamped = reduceStep(hydrated.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
    });

    expect(stamped.celebrations).toHaveLength(1);
    expect(stamped.celebrations[0].kind).toBe('STAMP_ADDED');
    expect(stamped.celebrations[0].eventId).toBe(
      customerStampEventId('membership_1', 1_500)
    );
    expect(stamped.celebrations[0].progressLine).toContain('6');
    expect(
      buildCustomerStampAddedMessage(
        stamped.celebrations[0].progressLine
      ).startsWith(CUSTOMER_STAMP_ADDED_TITLE)
    ).toBe(true);
  });

  test('the same membershipId and lastStampAt cannot celebrate twice', () => {
    const hydrated = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
    });
    const stamped = reduceStep(hydrated.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
    });
    const repeated = reduceStep(stamped.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
    });
    const restored = reduceStep(repeated.tracker, {
      memberships: [membership({ lastStampAt: 1_200, currentStamps: 1 })],
    });
    const sameEventAgain = reduceStep(restored.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
    });

    expect(stamped.celebrations).toHaveLength(1);
    expect(repeated.celebrations).toEqual([]);
    expect(restored.celebrations).toEqual([]);
    expect(sameEventAgain.celebrations).toEqual([]);
  });

  test('subscription hydration does not celebrate historic stamps', () => {
    const loading = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: undefined,
      serverArmedAt: null,
    });
    expect(loading.tracker.baselineByMembershipId).toBeNull();
    expect(loading.celebrations).toEqual([]);

    const hydrated = reduceStep(loading.tracker, {
      memberships: [
        membership({
          membershipId: 'old_card',
          lastStampAt: 100,
          currentStamps: 7,
        }),
        membership({
          membershipId: 'other_card',
          lastStampAt: 250,
          currentStamps: 3,
        }),
      ],
      serverArmedAt: 5_000,
    });

    expect(hydrated.celebrations).toEqual([]);
    expect(hydrated.tracker.baselineByMembershipId).toEqual({
      old_card: 100,
      other_card: 250,
    });
  });

  test('a new lastStampAt after the baseline celebrates once', () => {
    const hydrated = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 400, currentStamps: 3 })],
      serverArmedAt: 1_000,
    });
    const stamped = reduceStep(hydrated.tracker, {
      memberships: [membership({ lastStampAt: 1_800, currentStamps: 4 })],
      serverArmedAt: 1_000,
    });
    const quiet = reduceStep(stamped.tracker, {
      memberships: [membership({ lastStampAt: 1_800, currentStamps: 4 })],
      serverArmedAt: 1_000,
    });

    expect(stamped.celebrations).toHaveLength(1);
    expect(stamped.celebrations[0].lastStampAt).toBe(1_800);
    expect(quiet.celebrations).toEqual([]);
  });

  test('a stamp already inside the first snapshot after the server arm celebrates once', () => {
    const firstPayload = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 4 })],
      serverArmedAt: 1_000,
    });
    const again = reduceStep(firstPayload.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 4 })],
      serverArmedAt: 1_000,
    });

    expect(firstPayload.celebrations).toHaveLength(1);
    expect(firstPayload.celebrations[0].eventId).toBe(
      customerStampEventId('membership_1', 1_500)
    );
    expect(again.celebrations).toEqual([]);
  });

  test('a stamp observed before the server arm returns is not emitted twice', () => {
    let step = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
      serverArmedAt: null,
    });
    expect(step.celebrations).toEqual([]);

    step = reduceStep(step.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
      serverArmedAt: null,
    });
    expect(step.celebrations).toHaveLength(1);

    step = reduceStep(step.tracker, {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
      serverArmedAt: 1_000,
    });
    expect(step.celebrations).toEqual([]);
  });

  test('a failed arm does not celebrate the buffered snapshot, and a later stamp does', () => {
    const buffered = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 9_000, currentStamps: 4 })],
      serverArmedAt: null,
      serverArmFailed: true,
    });
    const stamped = reduceStep(buffered.tracker, {
      memberships: [membership({ lastStampAt: 9_500, currentStamps: 5 })],
      serverArmedAt: null,
      serverArmFailed: true,
    });

    expect(buffered.celebrations).toEqual([]);
    expect(stamped.celebrations).toHaveLength(1);
    expect(stamped.celebrations[0].kind).toBe('STAMP_ADDED');
  });

  test('the final stamp is CARD_COMPLETED and an earlier stamp is STAMP_ADDED', () => {
    expect(
      classifyCustomerStampCelebrationKind({ currentStamps: 7, maxStamps: 8 })
    ).toBe('STAMP_ADDED');
    expect(
      classifyCustomerStampCelebrationKind({ currentStamps: 8, maxStamps: 8 })
    ).toBe('CARD_COMPLETED');

    const hydrated = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [
        membership({ lastStampAt: 400, currentStamps: 7, maxStamps: 8 }),
      ],
      serverArmedAt: 1_000,
    });
    const completed = reduceStep(hydrated.tracker, {
      memberships: [
        membership({ lastStampAt: 1_500, currentStamps: 8, maxStamps: 8 }),
      ],
      serverArmedAt: 1_000,
    });

    expect(completed.celebrations).toHaveLength(1);
    expect(completed.celebrations[0].kind).toBe('CARD_COMPLETED');
    expect(CUSTOMER_CARD_COMPLETED_TITLE).toBe('🎉 השלמת את הכרטיסייה!');
    expect(CUSTOMER_CARD_COMPLETED_SUBTITLE).toBe('המתנה שלך מוכנה למימוש');
    expect(buildCustomerCardCompletedContext(completed.celebrations[0])).toBe(
      'קפה הבוקר · כרטיסיית קפה · קפה חינם'
    );
  });

  test('presentation and navigation each observe one stamp without suppressing the other', () => {
    const historic = {
      memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    };
    const stamped = {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    };

    expect(
      observeCustomerStampCelebrationChannel('presentation', historic)
    ).toEqual([]);
    const presented = observeCustomerStampCelebrationChannel(
      'presentation',
      stamped
    );
    expect(presented).toHaveLength(1);
    expect(
      observeCustomerStampCelebrationChannel('presentation', stamped)
    ).toEqual([]);

    expect(
      observeCustomerStampCelebrationChannel('navigation', historic)
    ).toEqual([]);
    const navigation = observeCustomerStampCelebrationChannel(
      'navigation',
      stamped
    );
    expect(navigation).toHaveLength(1);
    expect(navigation[0].eventId).toBe(presented[0].eventId);
    expect(
      observeCustomerStampCelebrationChannel('navigation', stamped)
    ).toEqual([]);
  });

  test('a celebration stays scheduled for its duration independent of a screen', () => {
    const celebration = {
      eventId: customerStampEventId('membership_1', 1_500),
      membershipId: 'membership_1',
      lastStampAt: 1_500,
      kind: 'STAMP_ADDED',
      progressLine: 'עוד 6',
      businessName: null,
      programTitle: null,
      rewardName: null,
    };
    const completed = {
      ...celebration,
      eventId: customerStampEventId('membership_1', 1_800),
      lastStampAt: 1_800,
      kind: 'CARD_COMPLETED',
    };

    const visible = publishCustomerStampCelebrations([celebration], 0);
    expect(visible?.hideAt).toBe(CUSTOMER_STAMP_CELEBRATION_DURATION_MS);
    expect(readCustomerStampPresentation(4_999)?.celebration.eventId).toBe(
      celebration.eventId
    );
    expect(readCustomerStampPresentation(5_000)).toBeNull();

    const first = publishCustomerStampCelebrations(
      [celebration, completed],
      10_000
    );
    expect(first?.celebration.kind).toBe('STAMP_ADDED');
    expect(first?.hideAt).toBe(10_000 + CUSTOMER_STAMP_CELEBRATION_DURATION_MS);
    const second = readCustomerStampPresentation(
      10_000 + CUSTOMER_STAMP_CELEBRATION_DURATION_MS
    );
    expect(second?.celebration.kind).toBe('CARD_COMPLETED');
    expect(second?.hideAt).toBe(
      10_000 +
        CUSTOMER_STAMP_CELEBRATION_DURATION_MS +
        CUSTOMER_CARD_COMPLETED_CELEBRATION_DURATION_MS
    );
    expect(takeCustomerStampPresentationFeedback(second)).toBe(
      'CARD_COMPLETED'
    );
    expect(takeCustomerStampPresentationFeedback(second)).toBeNull();
  });

  test('QR navigation remembers one target until it is cleared', () => {
    expect(noteCustomerStampNavigationTarget([])).toBe('');
    expect(
      noteCustomerStampNavigationTarget([
        {
          membershipId: 'membership_1',
          lastStampAt: 1_500,
        },
      ])
    ).toBe('membership_1');
    expect(noteCustomerStampNavigationTarget([])).toBe('membership_1');
    clearCustomerStampNavigationTarget();
    expect(noteCustomerStampNavigationTarget([])).toBe('');
  });
});

function presentedStamp(overrides = {}) {
  return {
    eventId: customerStampEventId('membership_1', 1_500),
    membershipId: 'membership_1',
    lastStampAt: 1_500,
    kind: 'STAMP_ADDED',
    progressLine: 'עוד 6',
    businessName: 'עסק של א',
    programTitle: 'תוכנית של א',
    rewardName: 'פרס של א',
    ...overrides,
  };
}

describe('customer stamp celebration session isolation', () => {
  beforeEach(() => {
    resetCustomerStampCelebrationSessionForTests();
  });

  test('logout then customer B does not inherit A presentation, tracker, or navigation', () => {
    expect(syncCustomerStampCelebrationSession('user_a')).toBe('reset');
    const shownForA = publishCustomerStampCelebrations([presentedStamp()], 0);
    expect(takeCustomerStampPresentationFeedback(shownForA)).toBe(
      'STAMP_ADDED'
    );
    noteCustomerStampNavigationTarget([
      { membershipId: 'card_a', lastStampAt: 1_500 },
    ]);
    observeCustomerStampCelebrationChannel('presentation', {
      memberships: [
        membership({
          membershipId: 'card_a',
          lastStampAt: 1_500,
          currentStamps: 2,
          businessName: 'עסק של א',
          rewardName: 'פרס של א',
        }),
      ],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    });
    const armForA = 1_000;
    expect(readCustomerStampPresentation(0)?.celebration.rewardName).toBe(
      'פרס של א'
    );

    expect(syncCustomerStampCelebrationSession(null)).toBe('reset');
    expect(readCustomerStampPresentation(0)).toBeNull();
    expect(noteCustomerStampNavigationTarget([])).toBe('');
    expect(readCustomerStampCelebrationSessionUserId()).toBeNull();

    expect(syncCustomerStampCelebrationSession('user_b')).toBe('reset');
    expect(readCustomerStampCelebrationSessionUserId()).toBe('user_b');
    expect(readCustomerStampPresentation(0)).toBeNull();
    expect(noteCustomerStampNavigationTarget([])).toBe('');

    const hydration = observeCustomerStampCelebrationChannel('presentation', {
      memberships: [
        membership({
          membershipId: 'card_b',
          lastStampAt: 400,
          currentStamps: 1,
          businessName: 'עסק של ב',
          rewardName: 'פרס של ב',
        }),
      ],
      serverArmedAt: armForA + 5_000,
      serverArmFailed: false,
    });
    expect(hydration).toEqual([]);

    const stamped = observeCustomerStampCelebrationChannel('presentation', {
      memberships: [
        membership({
          membershipId: 'card_b',
          lastStampAt: armForA + 6_000,
          currentStamps: 2,
          businessName: 'עסק של ב',
          rewardName: 'פרס של ב',
        }),
      ],
      serverArmedAt: armForA + 5_000,
      serverArmFailed: false,
    });
    expect(stamped).toHaveLength(1);
    expect(stamped[0].rewardName).toBe('פרס של ב');
    expect(stamped[0].eventId).not.toContain('user_a');
    expect(stamped[0].eventId).not.toContain('user_b');
    expect(stamped[0].eventId).toBe(
      customerStampEventId('card_b', armForA + 6_000)
    );
    const shownForB = publishCustomerStampCelebrations(stamped, 20_000);
    expect(shownForB?.celebration.rewardName).toBe('פרס של ב');
    expect(takeCustomerStampPresentationFeedback(shownForB)).toBe(
      'STAMP_ADDED'
    );
    expect(noteCustomerStampNavigationTarget(stamped)).toBe('card_b');
  });

  test('customer B gets a fresh arm and an in-flight arm from A cannot apply', async () => {
    let resolveArm = () => {};
    const pending = requestCustomerStampCelebrationArm(
      () =>
        new Promise((resolve) => {
          resolveArm = resolve;
        })
    );
    expect(syncCustomerStampCelebrationSession('user_b')).toBe('reset');
    resolveArm(1_111);
    await pending;
    expect(readCustomerStampCelebrationArmSnapshot().serverArmedAt).toBeNull();

    await requestCustomerStampCelebrationArm(async () => 2_222);
    expect(readCustomerStampCelebrationArmSnapshot()).toEqual({
      serverArmedAt: 2_222,
      serverArmFailed: false,
    });
    expect(readCustomerStampCelebrationSessionUserId()).toBe('user_b');
  });

  test('the same customer keeps exactly-once state across QR to card', () => {
    expect(syncCustomerStampCelebrationSession('user_a')).toBe('reset');
    const epoch = getCustomerStampCelebrationSessionEpoch();
    observeCustomerStampCelebrationChannel('navigation', {
      memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    });
    const stamped = observeCustomerStampCelebrationChannel('navigation', {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    });
    expect(noteCustomerStampNavigationTarget(stamped)).toBe('membership_1');
    publishCustomerStampCelebrations(stamped, 0);

    expect(syncCustomerStampCelebrationSession('user_a')).toBe('unchanged');
    expect(getCustomerStampCelebrationSessionEpoch()).toBe(epoch);
    expect(readCustomerStampPresentation(100)?.celebration.eventId).toBe(
      stamped[0].eventId
    );
    expect(
      observeCustomerStampCelebrationChannel('navigation', {
        memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
        serverArmedAt: 1_000,
        serverArmFailed: false,
      })
    ).toEqual([]);
    expect(noteCustomerStampNavigationTarget([])).toBe('membership_1');
    expect(readCustomerStampCelebrationSessionUserId()).toBe('user_a');
  });

  test('leaving customer mode drops the visible celebration and return does not replay it', () => {
    syncCustomerStampCelebrationSession('user_a');
    publishCustomerStampCelebrations([presentedStamp()], 0);
    expect(readCustomerStampPresentation(1_000)?.celebration.rewardName).toBe(
      'פרס של א'
    );

    expect(syncCustomerStampCelebrationSession(null)).toBe('reset');
    expect(readCustomerStampPresentation(1_000)).toBeNull();
    expect(noteCustomerStampNavigationTarget([])).toBe('');

    expect(syncCustomerStampCelebrationSession('user_a')).toBe('reset');
    expect(readCustomerStampPresentation(1_000)).toBeNull();
    expect(
      observeCustomerStampCelebrationChannel('presentation', {
        memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
        serverArmedAt: 2_000,
        serverArmFailed: false,
      })
    ).toEqual([]);
    expect(takeCustomerStampPresentationFeedback(null)).toBeNull();
  });

  test('the same event is exactly once inside one active customer session', () => {
    syncCustomerStampCelebrationSession('user_a');
    const input = {
      memberships: [membership({ lastStampAt: 1_500, currentStamps: 2 })],
      serverArmedAt: 1_000,
      serverArmFailed: false,
    };
    expect(
      observeCustomerStampCelebrationChannel('presentation', {
        memberships: [membership({ lastStampAt: 400, currentStamps: 1 })],
        serverArmedAt: 1_000,
        serverArmFailed: false,
      })
    ).toEqual([]);
    const first = observeCustomerStampCelebrationChannel('presentation', input);
    expect(first).toHaveLength(1);
    const shown = publishCustomerStampCelebrations(first, 0);
    expect(takeCustomerStampPresentationFeedback(shown)).toBe('STAMP_ADDED');
    expect(syncCustomerStampCelebrationSession('user_a')).toBe('unchanged');
    expect(
      observeCustomerStampCelebrationChannel('presentation', input)
    ).toEqual([]);
    expect(takeCustomerStampPresentationFeedback(shown)).toBeNull();
  });

  test('consumed stamp events stay bounded and the latest event remains exactly once', () => {
    const finalStampAt = CUSTOMER_STAMP_CONSUMED_EVENT_LIMIT + 50;
    let step = reduceStep(createCustomerStampCelebrationTracker(), {
      memberships: [membership({ lastStampAt: 1, currentStamps: 1 })],
      serverArmedAt: 0,
    });
    for (let stampAt = 2; stampAt <= finalStampAt; stampAt += 1) {
      step = reduceStep(step.tracker, {
        memberships: [membership({ lastStampAt: stampAt, currentStamps: 2 })],
        serverArmedAt: 0,
      });
    }

    expect(step.tracker.consumedEventIds.length).toBe(
      CUSTOMER_STAMP_CONSUMED_EVENT_LIMIT
    );
    expect(step.tracker.consumedEventIds.at(-1)).toBe(
      customerStampEventId('membership_1', finalStampAt)
    );
    expect(
      reduceStep(step.tracker, {
        memberships: [
          membership({ lastStampAt: finalStampAt, currentStamps: 2 }),
        ],
        serverArmedAt: 0,
      }).celebrations
    ).toEqual([]);
    expect(customerStampEventId('membership_1', finalStampAt)).not.toContain(
      'user_'
    );
  });

  test('session ownership stays on the authenticated user and not on the QR screen', () => {
    const host = readSource(STAMP_HOST);
    const showQr = readSource(QR_SOURCE);
    const algorithm = readSource(STAMP_LIB);

    expect(host).toContain('useUser()');
    expect(host).toContain(
      'syncCustomerStampCelebrationSession(customerUserId)'
    );
    expect(host).toContain('syncCustomerStampCelebrationSession(null)');
    expect(host).toContain('readCustomerStampCelebrationSessionUserId()');
    expect(showQr).not.toContain('syncCustomerStampCelebrationSession');
    expect(showQr).toContain('getCustomerStampCelebrationSessionEpoch()');
    expect(algorithm).not.toContain('console.');
  });
});

describe('customer stamp celebration ownership', () => {
  test('QR navigates to the canonical card without owning the celebration', () => {
    const showQr = readSource(QR_SOURCE);
    const card = readSource(CARD_SOURCE);
    const layout = readSource(AUTHENTICATED_LAYOUT);
    const customerLayout = readSource(CUSTOMER_LAYOUT);
    const host = readSource(STAMP_HOST);
    const algorithm = readSource(STAMP_LIB);

    expect(CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS).toBeGreaterThanOrEqual(900);
    expect(CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS).toBeLessThanOrEqual(1500);
    expect(CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS).not.toBe(350);
    expect(showQr).toContain('CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS');
    expect(showQr).toContain('customerCardRoute(latestMembershipId)');
    expect(showQr).toContain(
      "observeCustomerStampCelebrationChannel('navigation'"
    );
    expect(showQr).not.toContain('350');
    expect(showQr).not.toContain('lastCelebratedStampAtRef');
    expect(showQr).not.toContain('AnimatedActionBanner');
    expect(showQr).not.toContain('קיבלת חותמת');
    expect(showQr).not.toContain('Date.now() - latestStampAt');
    expect(showQr).toContain('router.replace(CUSTOMER_ROUTES.wallet)');

    expect(card).not.toContain('lastCelebratedStampAtRef');
    expect(card).not.toContain('AnimatedActionBanner');
    expect(card).not.toContain('קיבלת חותמת');
    expect(card).not.toContain('Date.now() - latestStampAt');
    expect(card).not.toContain('observeCustomerStampCelebrationChannel');

    expect(layout).toContain('<CustomerStampCelebrationHost />');
    expect(layout).toContain('<RedemptionCelebrationHost />');
    expect(layout).toContain("resolvedAppMode === 'customer'");
    expect(customerLayout).not.toContain('<CustomerStampCelebrationHost />');
    expect(host).toContain(
      "observeCustomerStampCelebrationChannel(\n      'presentation'"
    );
    expect(host).not.toContain('router.replace');
    expect(host).not.toContain('<Modal');
    expect(host).toContain('pointerEvents="none"');
    expect(algorithm).not.toContain('Date.now');
  });

  test('completion copy is distinct and redemption celebration stays separate', () => {
    const host = readSource(STAMP_HOST);
    const completion = host.slice(
      host.indexOf('function CustomerCardCompletedCelebration'),
      host.indexOf('export default function CustomerStampCelebrationHost')
    );
    const redemptionHost = readSource(REDEMPTION_HOST);
    const redemptionView = readSource(REDEMPTION_VIEW);
    const posCelebration = readSource(POS_CELEBRATION);

    expect(completion).toContain('CUSTOMER_CARD_COMPLETED_TITLE');
    expect(completion).toContain('CUSTOMER_CARD_COMPLETED_SUBTITLE');
    expect(completion).toContain('buildCustomerCardCompletedContext');
    expect(completion).toContain('prefersReducedMotion');
    expect(completion).not.toContain('CUSTOMER_STAMP_ADDED_TITLE');
    expect(completion).not.toContain('Confetti');
    expect(completion).not.toContain('showFireworks');
    expect(host).toContain('showFireworks={false}');
    expect(host).toContain('showConfetti={false}');
    expect(host).toContain('fullScreenCelebration={false}');
    expect(host).not.toContain('RedemptionCelebration');
    expect(host).not.toContain('redemptionReceipts');
    expect(host).not.toContain('PosRedemptionCelebration');
    expect(host).not.toContain('playRedemptionCelebrationFeedback');
    expect(redemptionHost).not.toContain('CustomerStampCelebration');
    expect(redemptionView).not.toContain('CustomerStampCelebration');
    expect(posCelebration).not.toContain('CustomerStampCelebration');
    expect(redemptionHost).toContain('api.redemptionReceipts');
  });
});

describe('dual-role customer card access', () => {
  const dualRole = {
    isPreviewMode: false,
    hasAuthenticatedUser: true,
    derivedRoleIsCustomer: false,
  };
  const customerRole = {
    isPreviewMode: false,
    hasAuthenticatedUser: true,
    derivedRoleIsCustomer: true,
  };

  test('dual-role ownership loading does not redirect and keeps the loading screen', () => {
    const loading = {
      ...dualRole,
      membershipOwnershipResolved: false,
      membershipBelongsToCurrentUser: false,
    };
    expect(shouldRedirectAwayFromOwnCustomerCard(loading)).toBe(false);
    expect(shouldWaitForOwnCustomerCardOwnership(loading)).toBe(true);
  });

  test('dual-role with a resolved own membership stays on the card', () => {
    const ownCard = {
      ...dualRole,
      membershipOwnershipResolved: true,
      membershipBelongsToCurrentUser: true,
    };
    expect(shouldRedirectAwayFromOwnCustomerCard(ownCard)).toBe(false);
    expect(shouldWaitForOwnCustomerCardOwnership(ownCard)).toBe(false);
  });

  test('dual-role with a resolved missing membership still leaves the card', () => {
    const missingCard = {
      ...dualRole,
      membershipOwnershipResolved: true,
      membershipBelongsToCurrentUser: false,
    };
    expect(shouldRedirectAwayFromOwnCustomerCard(missingCard)).toBe(true);
    expect(shouldWaitForOwnCustomerCardOwnership(missingCard)).toBe(false);
  });

  test('customer role behavior does not redirect for loading or a missing card', () => {
    expect(
      shouldRedirectAwayFromOwnCustomerCard({
        ...customerRole,
        membershipOwnershipResolved: false,
        membershipBelongsToCurrentUser: false,
      })
    ).toBe(false);
    expect(
      shouldWaitForOwnCustomerCardOwnership({
        ...customerRole,
        membershipOwnershipResolved: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectAwayFromOwnCustomerCard({
        ...customerRole,
        membershipOwnershipResolved: true,
        membershipBelongsToCurrentUser: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectAwayFromOwnCustomerCard({
        ...customerRole,
        membershipOwnershipResolved: true,
        membershipBelongsToCurrentUser: true,
      })
    ).toBe(false);
  });

  test('preview and signed-out states do not use the wallet role redirect', () => {
    expect(
      shouldRedirectAwayFromOwnCustomerCard({
        isPreviewMode: true,
        hasAuthenticatedUser: false,
        derivedRoleIsCustomer: false,
        membershipOwnershipResolved: false,
        membershipBelongsToCurrentUser: false,
      })
    ).toBe(false);
    expect(
      shouldWaitForOwnCustomerCardOwnership({
        isPreviewMode: true,
        hasAuthenticatedUser: false,
        derivedRoleIsCustomer: false,
        membershipOwnershipResolved: false,
      })
    ).toBe(false);
    expect(
      shouldRedirectAwayFromOwnCustomerCard({
        isPreviewMode: false,
        hasAuthenticatedUser: false,
        derivedRoleIsCustomer: false,
        membershipOwnershipResolved: true,
        membershipBelongsToCurrentUser: false,
      })
    ).toBe(false);
  });

  test('the card screen waits for ownership and leaves global role precedence intact', () => {
    const card = readSource(CARD_SOURCE);
    const roleGuard = readSource(ROLE_GUARD);
    const loadingGate = card.slice(
      card.indexOf('const membershipOwnershipResolved'),
      card.indexOf('if (!membershipId)')
    );

    expect(card).toContain(
      'membershipOwnershipResolved = memberships !== undefined'
    );
    expect(card).toContain('shouldWaitForOwnCustomerCardOwnership(');
    expect(card).toContain('shouldRedirectAwayFromOwnCustomerCard({');
    expect(card).toContain('derivedRoleIsCustomer: isAuthorized');
    expect(card).toContain('membershipBelongsToCurrentUser');
    expect(card).not.toContain(
      'membershipBelongsToCurrentUser: Boolean(membership)'
    );
    expect(loadingGate).toContain('return <FullScreenLoading />');
    expect(loadingGate.indexOf('return <FullScreenLoading />')).toBeLessThan(
      loadingGate.indexOf('shouldRedirectAwayFromOwnCustomerCard({')
    );
    expect(card).toContain('useRoleGuard([CUSTOMER_ROLE])');
    expect(card).not.toContain('if (!isAuthorized && !isPreviewMode)');
    expect(card).toContain('return <Redirect href="/(auth)/sign-up" />');
    expect(roleGuard).toContain(
      'if (sessionContext.roles.owner || sessionContext.roles.manager)'
    );
    expect(roleGuard).toContain("return 'merchant'");
    expect(roleGuard).toContain(
      "if (sessionContext.roles.staff) return 'staff'"
    );
    expect(roleGuard.indexOf("return 'merchant'")).toBeLessThan(
      roleGuard.lastIndexOf("return 'customer'")
    );
  });
});
