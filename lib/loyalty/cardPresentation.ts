import { isValidLoyaltyTarget } from './targetValidity';

export type LoyaltyCardVariant = 'wallet' | 'full' | 'preview' | 'management';

export type LoyaltyProgramLifecycle = 'draft' | 'active' | 'archived';

export type LoyaltyCardProgress =
  | { kind: 'actual'; currentStamps: number }
  | { kind: 'sample'; currentStamps: number }
  | { kind: 'none' };

export type LoyaltyCardState =
  | 'archived'
  | 'available'
  | 'rewardReady'
  | 'nearReward'
  | 'partial'
  | 'zero';

export type LoyaltyProgressStrategy = 'discrete' | 'hybrid';

type PresentationInput = {
  variant: LoyaltyCardVariant;
  lifecycle: LoyaltyProgramLifecycle;
  membershipStatus?: 'joined' | 'available';
  progress: LoyaltyCardProgress;
  maxStamps: number;
  rewardName: string;
};

export type LoyaltyCardPresentation = {
  target: number;
  targetIsValid: boolean;
  current: number;
  remaining: number;
  state: LoyaltyCardState;
  strategy: LoyaltyProgressStrategy;
  statusText: string;
  isSample: boolean;
  hasProgressData: boolean;
};

function toSafeInteger(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function sanitizeTarget(value: number) {
  return Math.max(1, toSafeInteger(value, 1));
}

export function sanitizeCurrent(value: number, target: number) {
  return Math.min(target, Math.max(0, toSafeInteger(value, 0)));
}

export function resolveProgressStrategy(
  variant: LoyaltyCardVariant,
  target: number
): LoyaltyProgressStrategy {
  const safeTarget = sanitizeTarget(target);
  const isExpanded = variant === 'full' || variant === 'preview';
  return safeTarget <= (isExpanded ? 12 : 10) ? 'discrete' : 'hybrid';
}

export function resolveLoyaltyCardPresentation({
  variant,
  lifecycle,
  membershipStatus = 'joined',
  progress,
  maxStamps,
  rewardName,
}: PresentationInput): LoyaltyCardPresentation {
  const targetIsValid = isValidLoyaltyTarget(maxStamps);
  const target = sanitizeTarget(maxStamps);
  const hasProgressData = targetIsValid && progress.kind !== 'none';
  const current = sanitizeCurrent(
    hasProgressData ? progress.currentStamps : 0,
    target
  );
  const remaining = targetIsValid ? Math.max(0, target - current) : 0;

  let state: LoyaltyCardState;
  if (lifecycle === 'archived') {
    state = 'archived';
  } else if (membershipStatus === 'available') {
    state = 'available';
  } else if (hasProgressData && current >= target) {
    state = 'rewardReady';
  } else if (current > 0 && remaining <= 2) {
    state = 'nearReward';
  } else if (current > 0) {
    state = 'partial';
  } else {
    state = 'zero';
  }

  const statusText = resolveStatusText({
    state,
    remaining,
    rewardName,
    target,
    targetIsValid,
    hasProgressData,
  });

  return {
    target,
    targetIsValid,
    current,
    remaining,
    state,
    strategy: resolveProgressStrategy(variant, target),
    statusText,
    isSample: progress.kind === 'sample',
    hasProgressData,
  };
}

function resolveStatusText({
  state,
  remaining,
  rewardName,
  target,
  targetIsValid,
  hasProgressData,
}: {
  state: LoyaltyCardState;
  remaining: number;
  rewardName: string;
  target: number;
  targetIsValid: boolean;
  hasProgressData: boolean;
}) {
  if (state === 'archived') {
    return 'הכרטיס בארכיון ואינו זמין לצבירה או למימוש';
  }
  if (state === 'available') {
    return 'מצטרפים ומתחילים לצבור';
  }
  if (!targetIsValid) {
    return 'נתוני ההתקדמות אינם זמינים כרגע';
  }
  if (!hasProgressData) {
    return `יעד הכרטיס · ${target} ניקובים`;
  }
  if (state === 'rewardReady') {
    return 'ההטבה מוכנה למימוש';
  }
  if (state === 'nearReward') {
    return `כמעט שם · נשארו ${remaining}`;
  }
  if (state === 'partial') {
    return `עוד ${remaining} ניקובים ל־${rewardName.trim()}`;
  }
  return `המסע מתחיל כאן · עוד ${remaining} ניקובים`;
}

export function buildLoyaltyCardAccessibilityLabel({
  businessName,
  programTitle,
  rewardName,
  presentation,
}: {
  businessName: string;
  programTitle: string;
  rewardName: string;
  presentation: LoyaltyCardPresentation;
}) {
  const progressText = !presentation.targetIsValid
    ? 'נתוני ההתקדמות אינם זמינים כרגע'
    : presentation.hasProgressData
      ? `${presentation.current} מתוך ${presentation.target} ניקובים`
      : `יעד של ${presentation.target} ניקובים, ללא נתוני התקדמות`;
  const sampleText = presentation.isSample ? 'תצוגה לדוגמה. ' : '';
  const statusText =
    presentation.statusText === progressText
      ? ''
      : `. ${presentation.statusText}`;
  return `${sampleText}${businessName}. ${programTitle}. ${rewardName}. ${progressText}${statusText}`;
}

export function getBusinessMonogram(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (tokens.length === 0) {
    return 'S';
  }
  return tokens
    .map((token) => Array.from(token)[0]?.toLocaleUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}
