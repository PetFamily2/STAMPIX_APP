import { buildRewardProgressLine } from '../memberships/celebrationMessage';

/**
 * Customer stamp celebration session.
 *
 * Event identity is membershipId + lastStampAt. Device time is not part of
 * that identity. A server arm timestamp classifies only the first snapshot.
 *
 * Baseline / update:
 * 1. memberships === undefined is still loading. Do not baseline and do not
 *    celebrate.
 * 2. The first defined snapshot is provisional. Historic rows are not
 *    celebrated. A later provisional snapshot celebrates only when an
 *    already-seen membership's lastStampAt increases. That covers a stamp
 *    that arrives before the server arm returns.
 * 3. When the server arm timestamp arrives, commit the latest snapshot.
 *    lastStampAt strictly greater than the arm time is a live event, including
 *    a stamp that was already inside the first query result. Equal or older
 *    rows are consumed without a celebration.
 * 4. If the arm fails, commit the latest snapshot without celebrating it, then
 *    follow the live rules below. This avoids replaying history when the
 *    watermark is unavailable.
 * 5. After commit, a higher lastStampAt celebrates once. A lower lastStampAt
 *    updates the baseline without celebrating. A membership that appears later
 *    celebrates unless its lastStampAt is at or before the server arm time.
 * 6. consumed event ids make membershipId + lastStampAt exactly-once for the
 *    life of the tracker. Presentation and QR navigation keep separate
 *    trackers so one channel cannot suppress the other.
 *
 * Session isolation:
 * The module state is bound to the authenticated user id. Logout, account
 * switch, and leaving customer mode clear presentation, both trackers,
 * navigation, feedback, and the server arm. QR to card stays inside the
 * mounted host, so that navigation does not clear the session. Returning
 * from business mode starts a fresh customer session and does not restore
 * a celebration that was queued while the host was gone.
 */

export const CUSTOMER_STAMP_ADDED_TITLE = 'קיבלת חותמת!';
export const CUSTOMER_CARD_COMPLETED_TITLE = '🎉 השלמת את הכרטיסייה!';
export const CUSTOMER_CARD_COMPLETED_SUBTITLE = 'המתנה שלך מוכנה למימוש';
export const CUSTOMER_STAMP_CELEBRATION_DURATION_MS = 5000;
export const CUSTOMER_CARD_COMPLETED_CELEBRATION_DURATION_MS = 5000;
export const CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS = 1200;
export const CUSTOMER_STAMP_CONSUMED_EVENT_LIMIT = 200;
const CUSTOMER_STAMP_PRESENTATION_QUEUE_LIMIT = 20;

export type CustomerStampCelebrationKind = 'STAMP_ADDED' | 'CARD_COMPLETED';

export type CustomerStampMembershipSnapshot = {
  membershipId: string;
  lastStampAt: number;
  currentStamps: number;
  maxStamps: number;
  businessName: string | null;
  programTitle: string | null;
  rewardName: string | null;
};

export type CustomerStampCelebration = {
  eventId: string;
  membershipId: string;
  lastStampAt: number;
  kind: CustomerStampCelebrationKind;
  progressLine: string;
  businessName: string | null;
  programTitle: string | null;
  rewardName: string | null;
};

export type CustomerStampCelebrationTracker = {
  baselineByMembershipId: Record<string, number> | null;
  provisionalByMembershipId: Record<string, number> | null;
  consumedEventIds: string[];
  serverArmedAt: number | null;
};

export type CustomerStampCelebrationReduceInput = {
  memberships: readonly CustomerStampMembershipInput[] | undefined;
  serverArmedAt: number | null;
  serverArmFailed: boolean;
};

type CustomerStampMembershipInput = {
  membershipId?: string | null;
  lastStampAt?: number | null;
  currentStamps?: number | null;
  maxStamps?: number | null;
  businessName?: string | null;
  programTitle?: string | null;
  rewardName?: string | null;
};

type WorkingTracker = {
  baselineByMembershipId: Record<string, number> | null;
  provisionalByMembershipId: Record<string, number> | null;
  consumedEventIds: Set<string>;
  consumedEventOrder: string[];
  serverArmedAt: number | null;
};

export type CustomerStampCelebrationChannel = 'presentation' | 'navigation';

export type CustomerStampPresentation = {
  celebration: CustomerStampCelebration;
  eventKey: number;
  hideAt: number;
};

type PresentationStore = {
  queue: CustomerStampCelebration[];
  current: CustomerStampPresentation | null;
  eventKey: number;
};

const celebrationChannels: Record<
  CustomerStampCelebrationChannel,
  CustomerStampCelebrationTracker
> = {
  presentation: createCustomerStampCelebrationTracker(),
  navigation: createCustomerStampCelebrationTracker(),
};

let presentationStore: PresentationStore = {
  queue: [],
  current: null,
  eventKey: 0,
};
let announcedEventKey = 0;
let pendingNavigationMembershipId: string | null = null;
let activeSessionUserId: string | null = null;
let sessionEpoch = 0;
let resetArmState = () => {};
const sessionListeners = new Set<() => void>();

export function createCustomerStampCelebrationTracker(): CustomerStampCelebrationTracker {
  return {
    baselineByMembershipId: null,
    provisionalByMembershipId: null,
    consumedEventIds: [],
    serverArmedAt: null,
  };
}

export function customerStampEventId(
  membershipId: string,
  lastStampAt: number
): string {
  return `${membershipId}:${lastStampAt}`;
}

export function classifyCustomerStampCelebrationKind(input: {
  currentStamps: number;
  maxStamps: number;
}): CustomerStampCelebrationKind {
  const goal = Math.max(1, Math.floor(Number(input.maxStamps) || 0));
  const current = Math.max(0, Math.floor(Number(input.currentStamps) || 0));
  return current >= goal ? 'CARD_COMPLETED' : 'STAMP_ADDED';
}

export function buildCustomerStampAddedMessage(progressLine: string): string {
  return `${CUSTOMER_STAMP_ADDED_TITLE}\n${progressLine}`;
}

export function buildCustomerCardCompletedContext(input: {
  businessName?: string | null;
  programTitle?: string | null;
  rewardName?: string | null;
}): string | null {
  const parts = [
    cleanLabel(input.businessName),
    cleanLabel(input.programTitle),
    cleanLabel(input.rewardName),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' · ');
}

export function toCustomerStampMembershipSnapshots(
  memberships: readonly CustomerStampMembershipInput[] | undefined
): CustomerStampMembershipSnapshot[] | undefined {
  if (memberships === undefined) {
    return undefined;
  }
  return normalizeMemberships(memberships);
}

export function reduceCustomerStampCelebration(
  tracker: CustomerStampCelebrationTracker,
  input: CustomerStampCelebrationReduceInput
): {
  tracker: CustomerStampCelebrationTracker;
  celebrations: CustomerStampCelebration[];
} {
  const working = createWorkingTracker(tracker);
  const incomingArmedAt = finiteNumber(input.serverArmedAt);
  if (working.serverArmedAt === null && incomingArmedAt !== null) {
    working.serverArmedAt = incomingArmedAt;
  }

  if (input.memberships === undefined) {
    return { tracker: toTracker(working), celebrations: [] };
  }

  const memberships = normalizeMemberships(input.memberships);
  const celebrations: CustomerStampCelebration[] = [];

  if (working.baselineByMembershipId === null) {
    applyProvisionalSnapshot(working, memberships, celebrations, input);
    return {
      tracker: toTracker(working),
      celebrations: sortCelebrations(celebrations),
    };
  }

  applyLiveSnapshot(working, memberships, celebrations);
  return {
    tracker: toTracker(working),
    celebrations: sortCelebrations(celebrations),
  };
}

export function registerCustomerStampCelebrationArmReset(reset: () => void) {
  resetArmState = reset;
}

export function readCustomerStampCelebrationSessionUserId(): string | null {
  return activeSessionUserId;
}

export function getCustomerStampCelebrationSessionEpoch(): number {
  return sessionEpoch;
}

export function subscribeCustomerStampCelebrationSession(
  listener: () => void
): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Binds celebration state to one authenticated user.
 * A different id, or null on logout, drops the previous session.
 * The same id is a no-op so screen changes can keep exactly-once state.
 */
export function syncCustomerStampCelebrationSession(
  userId: string | null
): 'unchanged' | 'reset' {
  const nextUserId = normalizeSessionUserId(userId);
  if (nextUserId === activeSessionUserId) {
    return 'unchanged';
  }
  clearCustomerStampCelebrationState();
  activeSessionUserId = nextUserId;
  resetArmState();
  sessionEpoch += 1;
  for (const listener of sessionListeners) {
    listener();
  }
  return 'reset';
}

export function observeCustomerStampCelebrationChannel(
  channel: CustomerStampCelebrationChannel,
  input: CustomerStampCelebrationReduceInput
): CustomerStampCelebration[] {
  const reduced = reduceCustomerStampCelebration(
    celebrationChannels[channel],
    input
  );
  celebrationChannels[channel] = reduced.tracker;
  return reduced.celebrations;
}

export function selectLatestCustomerStampMembershipId(
  celebrations: readonly Pick<
    CustomerStampCelebration,
    'membershipId' | 'lastStampAt'
  >[]
): string {
  let latestMembershipId = '';
  let latestStampAt = Number.NEGATIVE_INFINITY;
  for (const celebration of celebrations) {
    if (celebration.lastStampAt >= latestStampAt) {
      latestStampAt = celebration.lastStampAt;
      latestMembershipId = celebration.membershipId;
    }
  }
  return latestMembershipId;
}

export function noteCustomerStampNavigationTarget(
  celebrations: readonly Pick<
    CustomerStampCelebration,
    'membershipId' | 'lastStampAt'
  >[]
): string {
  const latestMembershipId =
    selectLatestCustomerStampMembershipId(celebrations);
  if (latestMembershipId) {
    pendingNavigationMembershipId = latestMembershipId;
  }
  return pendingNavigationMembershipId ?? '';
}

export function clearCustomerStampNavigationTarget() {
  pendingNavigationMembershipId = null;
}

export function publishCustomerStampCelebrations(
  celebrations: readonly CustomerStampCelebration[],
  now: number
): CustomerStampPresentation | null {
  for (const celebration of celebrations) {
    presentationStore.queue.push(celebration);
  }
  while (
    presentationStore.queue.length > CUSTOMER_STAMP_PRESENTATION_QUEUE_LIMIT
  ) {
    presentationStore.queue.shift();
  }
  expirePresentation(now);
  if (!presentationStore.current) {
    promotePresentation(now);
  }
  return presentationStore.current;
}

export function readCustomerStampPresentation(
  now: number
): CustomerStampPresentation | null {
  expirePresentation(now);
  return presentationStore.current;
}

export function takeCustomerStampPresentationFeedback(
  presentation: CustomerStampPresentation | null
): CustomerStampCelebrationKind | null {
  if (!presentation || presentation.eventKey === announcedEventKey) {
    return null;
  }
  announcedEventKey = presentation.eventKey;
  return presentation.celebration.kind;
}

export function resetCustomerStampCelebrationSessionForTests() {
  clearCustomerStampCelebrationState();
  activeSessionUserId = null;
  sessionEpoch = 0;
  resetArmState();
}

function clearCustomerStampCelebrationState() {
  celebrationChannels.presentation = createCustomerStampCelebrationTracker();
  celebrationChannels.navigation = createCustomerStampCelebrationTracker();
  presentationStore = {
    queue: [],
    current: null,
    eventKey: 0,
  };
  announcedEventKey = 0;
  pendingNavigationMembershipId = null;
}

function normalizeSessionUserId(userId: string | null): string | null {
  if (typeof userId !== 'string') {
    return null;
  }
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function applyProvisionalSnapshot(
  working: WorkingTracker,
  memberships: readonly CustomerStampMembershipSnapshot[],
  celebrations: CustomerStampCelebration[],
  input: CustomerStampCelebrationReduceInput
) {
  const previous = working.provisionalByMembershipId;
  if (previous) {
    for (const membership of memberships) {
      const previousStampAt = previous[membership.membershipId];
      if (
        previousStampAt !== undefined &&
        membership.lastStampAt > previousStampAt
      ) {
        emitCelebration(working, membership, celebrations);
      }
    }
  }

  working.provisionalByMembershipId = baselineFrom(memberships);

  if (working.serverArmedAt !== null) {
    commitHydration(working, memberships, celebrations, working.serverArmedAt);
    return;
  }

  if (input.serverArmFailed) {
    for (const membership of memberships) {
      rememberEvent(working, membership.membershipId, membership.lastStampAt);
    }
    working.baselineByMembershipId = baselineFrom(memberships);
    working.provisionalByMembershipId = null;
  }
}

function commitHydration(
  working: WorkingTracker,
  memberships: readonly CustomerStampMembershipSnapshot[],
  celebrations: CustomerStampCelebration[],
  serverArmedAt: number
) {
  for (const membership of memberships) {
    if (membership.lastStampAt > serverArmedAt) {
      emitCelebration(working, membership, celebrations);
    } else {
      rememberEvent(working, membership.membershipId, membership.lastStampAt);
    }
  }
  working.baselineByMembershipId = baselineFrom(memberships);
  working.provisionalByMembershipId = null;
}

function applyLiveSnapshot(
  working: WorkingTracker,
  memberships: readonly CustomerStampMembershipSnapshot[],
  celebrations: CustomerStampCelebration[]
) {
  const baseline = working.baselineByMembershipId;
  if (!baseline) {
    return;
  }

  for (const membership of memberships) {
    const previousStampAt = baseline[membership.membershipId];
    if (previousStampAt === undefined) {
      const armedAt = working.serverArmedAt;
      const historic = armedAt !== null && membership.lastStampAt <= armedAt;
      if (historic) {
        rememberEvent(working, membership.membershipId, membership.lastStampAt);
      } else {
        emitCelebration(working, membership, celebrations);
      }
      baseline[membership.membershipId] = membership.lastStampAt;
      continue;
    }

    if (membership.lastStampAt > previousStampAt) {
      emitCelebration(working, membership, celebrations);
      baseline[membership.membershipId] = membership.lastStampAt;
      continue;
    }

    if (membership.lastStampAt < previousStampAt) {
      rememberEvent(working, membership.membershipId, membership.lastStampAt);
      baseline[membership.membershipId] = membership.lastStampAt;
    }
  }
}

function emitCelebration(
  working: WorkingTracker,
  membership: CustomerStampMembershipSnapshot,
  celebrations: CustomerStampCelebration[]
) {
  if (membership.lastStampAt <= 0) {
    return;
  }
  const eventId = customerStampEventId(
    membership.membershipId,
    membership.lastStampAt
  );
  if (!consumeEvent(working, eventId)) {
    return;
  }
  celebrations.push({
    eventId,
    membershipId: membership.membershipId,
    lastStampAt: membership.lastStampAt,
    kind: classifyCustomerStampCelebrationKind(membership),
    progressLine: buildRewardProgressLine(membership),
    businessName: membership.businessName,
    programTitle: membership.programTitle,
    rewardName: membership.rewardName,
  });
}

function rememberEvent(
  working: WorkingTracker,
  membershipId: string,
  lastStampAt: number
) {
  if (lastStampAt <= 0) {
    return;
  }
  consumeEvent(working, customerStampEventId(membershipId, lastStampAt));
}

function consumeEvent(working: WorkingTracker, eventId: string): boolean {
  if (working.consumedEventIds.has(eventId)) {
    return false;
  }
  working.consumedEventIds.add(eventId);
  working.consumedEventOrder.push(eventId);
  if (working.consumedEventOrder.length > CUSTOMER_STAMP_CONSUMED_EVENT_LIMIT) {
    const oldest = working.consumedEventOrder.shift();
    if (oldest) {
      working.consumedEventIds.delete(oldest);
    }
  }
  return true;
}

function expirePresentation(now: number) {
  while (presentationStore.current && now >= presentationStore.current.hideAt) {
    promotePresentation(now);
  }
}

function promotePresentation(now: number) {
  const next = presentationStore.queue.shift() ?? null;
  if (!next) {
    presentationStore.current = null;
    return;
  }
  presentationStore.eventKey += 1;
  const durationMs =
    next.kind === 'CARD_COMPLETED'
      ? CUSTOMER_CARD_COMPLETED_CELEBRATION_DURATION_MS
      : CUSTOMER_STAMP_CELEBRATION_DURATION_MS;
  presentationStore.current = {
    celebration: next,
    eventKey: presentationStore.eventKey,
    hideAt: now + durationMs,
  };
}

function createWorkingTracker(
  tracker: CustomerStampCelebrationTracker
): WorkingTracker {
  return {
    baselineByMembershipId: tracker.baselineByMembershipId
      ? { ...tracker.baselineByMembershipId }
      : null,
    provisionalByMembershipId: tracker.provisionalByMembershipId
      ? { ...tracker.provisionalByMembershipId }
      : null,
    consumedEventIds: new Set(tracker.consumedEventIds),
    consumedEventOrder: tracker.consumedEventIds.slice(),
    serverArmedAt: tracker.serverArmedAt,
  };
}

function toTracker(working: WorkingTracker): CustomerStampCelebrationTracker {
  return {
    baselineByMembershipId: working.baselineByMembershipId,
    provisionalByMembershipId: working.provisionalByMembershipId,
    consumedEventIds: working.consumedEventOrder.slice(),
    serverArmedAt: working.serverArmedAt,
  };
}

function baselineFrom(
  memberships: readonly CustomerStampMembershipSnapshot[]
): Record<string, number> {
  const baseline: Record<string, number> = {};
  for (const membership of memberships) {
    baseline[membership.membershipId] = membership.lastStampAt;
  }
  return baseline;
}

function normalizeMemberships(
  memberships: readonly CustomerStampMembershipInput[]
): CustomerStampMembershipSnapshot[] {
  const byId = new Map<string, CustomerStampMembershipSnapshot>();
  for (const membership of memberships) {
    const membershipId = String(membership.membershipId ?? '').trim();
    const lastStampAt = Number(membership.lastStampAt);
    if (!membershipId || !Number.isFinite(lastStampAt) || lastStampAt < 0) {
      continue;
    }
    const snapshot: CustomerStampMembershipSnapshot = {
      membershipId,
      lastStampAt,
      currentStamps: Math.max(
        0,
        Math.floor(Number(membership.currentStamps) || 0)
      ),
      maxStamps: Math.max(0, Math.floor(Number(membership.maxStamps) || 0)),
      businessName: cleanLabel(membership.businessName),
      programTitle: cleanLabel(membership.programTitle),
      rewardName: cleanLabel(membership.rewardName),
    };
    const existing = byId.get(membershipId);
    if (!existing || snapshot.lastStampAt >= existing.lastStampAt) {
      byId.set(membershipId, snapshot);
    }
  }
  return Array.from(byId.values()).sort((left, right) =>
    left.membershipId < right.membershipId
      ? -1
      : left.membershipId > right.membershipId
        ? 1
        : 0
  );
}

function sortCelebrations(
  celebrations: CustomerStampCelebration[]
): CustomerStampCelebration[] {
  return celebrations.sort((left, right) => {
    if (left.lastStampAt !== right.lastStampAt) {
      return left.lastStampAt - right.lastStampAt;
    }
    return left.membershipId < right.membershipId ? -1 : 1;
  });
}

function cleanLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
