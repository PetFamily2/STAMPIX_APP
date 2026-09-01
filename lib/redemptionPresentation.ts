import { resolveCardTheme } from '@/constants/cardThemes';
import { getBusinessMonogram } from '@/lib/loyalty/cardPresentation';

export type RedemptionVariant = 'standard' | 'referral';

export type RedemptionExperienceState =
  | 'normal'
  | 'loading'
  | 'expired'
  | 'unavailable'
  | 'revoked';

export type RedemptionPresentationInput = {
  variant: RedemptionVariant;
  state: RedemptionExperienceState;
  businessName?: string | null;
  businessLogoUrl?: string | null;
  programDisplayName?: string | null;
  rewardDisplayName?: string | null;
  cardThemeId?: string | null;
};

export const REDEMPTION_PRESENTATION_INPUT_KEYS = [
  'variant',
  'state',
  'businessName',
  'businessLogoUrl',
  'programDisplayName',
  'rewardDisplayName',
  'cardThemeId',
] as const satisfies readonly (keyof RedemptionPresentationInput)[];

type RedemptionCopy = {
  eyebrow: string;
  title: string;
  body: string;
  benefitLabel: string;
  shareButton: string;
  sharingButton: string;
  shareHint: string;
};

export type RedemptionPresentation = {
  variant: RedemptionVariant;
  state: RedemptionExperienceState;
  canShare: boolean;
  businessName: string;
  businessLogoUrl: string | null;
  businessMonogram: string;
  programDisplayName: string | null;
  rewardDisplayName: string;
  palette: {
    surface: string;
    surfaceAlt: string;
    accent: string;
    onAccent: string;
    onSurface: string;
    onSurfaceMuted: string;
    keyline: string;
    glow: string;
  };
  copy: RedemptionCopy;
  accessibilityLabel: string;
};

const DEFAULT_BUSINESS_NAME = 'בית העסק';
const DEFAULT_REWARD_NAME = 'הטבה מיוחדת';

function cleanDisplayText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeLogoUrl(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }
  return normalized;
}

function resolveCopy(
  variant: RedemptionVariant,
  state: RedemptionExperienceState
): RedemptionCopy {
  if (state === 'loading') {
    return {
      eyebrow: 'כמעט שם',
      title: 'מכינים את רגע המימוש',
      body: 'הפרטים יופיעו כאן מיד.',
      benefitLabel: 'ההטבה',
      shareButton: 'שיתוף',
      sharingButton: 'מכינים לשיתוף...',
      shareHint: 'כרטיס השיתוף ייווצר במכשיר בלבד.',
    };
  }

  if (state === 'expired') {
    return {
      eyebrow: 'עדכון הטבה',
      title: 'תוקף ההטבה הסתיים',
      body: 'ההטבה הזו כבר אינה זמינה למימוש או לשיתוף.',
      benefitLabel: 'הטבה שפג תוקפה',
      shareButton: 'שיתוף לא זמין',
      sharingButton: 'שיתוף לא זמין',
      shareHint: 'לא ניתן לשתף הטבה שפג תוקפה.',
    };
  }

  if (state === 'revoked') {
    return {
      eyebrow: 'עדכון הטבה',
      title: 'ההטבה בוטלה',
      body: 'לא ניתן עוד לממש או לשתף את ההטבה הזו.',
      benefitLabel: 'הטבה שבוטלה',
      shareButton: 'שיתוף לא זמין',
      sharingButton: 'שיתוף לא זמין',
      shareHint: 'לא ניתן לשתף הטבה שבוטלה.',
    };
  }

  if (state === 'unavailable') {
    return {
      eyebrow: 'עדכון הטבה',
      title: 'ההטבה אינה זמינה כרגע',
      body: 'לא הצלחנו להציג את פרטי המימוש. אפשר לנסות שוב בהמשך.',
      benefitLabel: 'הטבה לא זמינה',
      shareButton: 'שיתוף לא זמין',
      sharingButton: 'שיתוף לא זמין',
      shareHint: 'השיתוף יתאפשר כשההטבה תחזור להיות זמינה.',
    };
  }

  if (variant === 'referral') {
    return {
      eyebrow: 'הטבת חברים',
      title: 'הטבת החברים מומשה בהצלחה',
      body: 'חברות טובה, רגע משמח והטבה שכיף ליהנות ממנה.',
      benefitLabel: 'הטבת החברים שלך',
      shareButton: 'שיתוף הרגע',
      sharingButton: 'מכינים לשיתוף...',
      shareHint: 'השיתוף כולל רק את פרטי העסק וההטבה.',
    };
  }

  return {
    eyebrow: 'רגע של פינוק',
    title: 'ההטבה מומשה בהצלחה',
    body: 'איזה כיף ליהנות מההטבה שחיכתה לך.',
    benefitLabel: 'ההטבה שלך',
    shareButton: 'שיתוף הרגע',
    sharingButton: 'מכינים לשיתוף...',
    shareHint: 'השיתוף כולל רק את פרטי העסק וההטבה.',
  };
}

export function buildRedemptionPresentation(
  input: RedemptionPresentationInput
): RedemptionPresentation {
  const variant: RedemptionVariant =
    input.variant === 'referral' ? 'referral' : 'standard';
  const state: RedemptionExperienceState = [
    'normal',
    'loading',
    'expired',
    'unavailable',
    'revoked',
  ].includes(input.state)
    ? input.state
    : 'unavailable';
  const businessName =
    cleanDisplayText(input.businessName, 80) ?? DEFAULT_BUSINESS_NAME;
  const programDisplayName = cleanDisplayText(input.programDisplayName, 100);
  const rewardDisplayName =
    cleanDisplayText(input.rewardDisplayName, 120) ?? DEFAULT_REWARD_NAME;
  const theme = resolveCardTheme(input.cardThemeId ?? undefined);
  const copy = resolveCopy(variant, state);

  return {
    variant,
    state,
    canShare: state === 'normal',
    businessName,
    businessLogoUrl: sanitizeLogoUrl(input.businessLogoUrl),
    businessMonogram: getBusinessMonogram(businessName),
    programDisplayName,
    rewardDisplayName,
    palette: {
      surface: theme.surface,
      surfaceAlt: theme.surfaceAlt,
      accent: theme.accent,
      onAccent: theme.onAccent,
      onSurface: theme.onSurface,
      onSurfaceMuted: theme.onSurfaceMuted,
      keyline: theme.keyline,
      glow: theme.glow,
    },
    copy,
    accessibilityLabel: [
      copy.title,
      businessName,
      programDisplayName,
      rewardDisplayName,
    ]
      .filter(Boolean)
      .join('. '),
  };
}
