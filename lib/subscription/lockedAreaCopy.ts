export type RequiredPlan = 'starter' | 'pro' | 'premium' | null | undefined;

export type LockedAreaKey =
  | 'team'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'advancedReports'
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth'
  | 'maxTeamSeats'
  | 'business_subscription'
  | 'onboarding_plan_selection'
  | 'generic';

type LockedAreaDefinition = {
  sectionTitle: string;
  lockedTitle: string;
  lockedSubtitle: (requiredPlanLabel: string | null) => string;
  benefits: string[];
  upgradeAreaLabel: string;
};

const PLAN_LABELS: Record<'starter' | 'pro' | 'premium', string> = {
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
};

function availableOnPlan(requiredPlanLabel: string | null) {
  return requiredPlanLabel
    ? `זמין במסלול ${requiredPlanLabel}`
    : 'זמין במסלול מתקדם יותר';
}

const FEATURE_KEY_ALIAS_MAP: Record<string, LockedAreaKey> = {
  team: 'team',
  canManageTeam: 'team',
  marketingHub: 'marketingHub',
  canUseMarketingHubAI: 'marketingHub',
  smartAnalytics: 'smartAnalytics',
  canUseSmartAnalytics: 'smartAnalytics',
  advancedReports: 'advancedReports',
  canSeeAdvancedReports: 'advancedReports',
  maxCards: 'maxCards',
  maxCustomers: 'maxCustomers',
  maxActiveRetentionActions: 'maxActiveRetentionActions',
  maxCampaigns: 'maxCampaigns',
  maxAiExecutionsPerMonth: 'maxAiExecutionsPerMonth',
  maxTeamSeats: 'maxTeamSeats',
  business_subscription: 'business_subscription',
  onboarding_plan_selection: 'onboarding_plan_selection',
};

const LOCKED_AREA_COPY: Record<LockedAreaKey, LockedAreaDefinition> = {
  team: {
    sectionTitle: 'ניהול צוות',
    lockedTitle: 'ניהול צוות נעול במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `הזמנת עובדים ${availableOnPlan(requiredPlanLabel)}`,
    benefits: ['הזמנת עובדים וניהול הרשאות', 'עבודה מסודרת עם צוות'],
    upgradeAreaLabel: 'ניהול צוות',
  },
  marketingHub: {
    sectionTitle: 'מרכז הקמפיינים',
    lockedTitle: 'מרכז הקמפיינים מוגבל במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `קמפיינים ידניים זמינים לפי מכסת המסלול. יכולות AI ${availableOnPlan(
        requiredPlanLabel ?? 'Pro'
      )}`,
    benefits: [
      'קמפיינים ידניים לפי מכסת המסלול (מ-Starter)',
      'המלצות AI ופעולות חכמות מ-Pro: 100 בחודש, 300 ב-Premium',
    ],
    upgradeAreaLabel: 'מרכז הקמפיינים',
  },
  smartAnalytics: {
    sectionTitle: 'תובנות לקוחות',
    lockedTitle: 'תובנות לקוחות נעולות',
    lockedSubtitle: (requiredPlanLabel) =>
      `רשימת לקוחות וניהול בסיסי נשארים זמינים בכל המסלולים. תובנות מתקדמות זמינות במסלול ${
        requiredPlanLabel ?? 'מתקדם יותר'
      }`,
    benefits: [
      'רשימת לקוחות וניהול בסיסי \u2014 בכל המסלולים',
      'זיהוי לקוחות בסיכון ותובנות לצמיחה',
    ],
    upgradeAreaLabel: 'תובנות לקוחות',
  },
  advancedReports: {
    sectionTitle: 'מודיעין עסקי',
    lockedTitle: 'היכולת הזו אינה חלק ממסלולי השיגור',
    lockedSubtitle: () =>
      'השוואת המסלולים מציגה רק יכולות שקיימות בשיגור. מודיעין עסקי בסיסי זמין במסלולים הפעילים',
    benefits: ['מודיעין עסקי בסיסי זמין במסלול Starter ומעלה'],
    upgradeAreaLabel: 'מודיעין עסקי',
  },
  maxCards: {
    sectionTitle: 'מגבלת כרטיסים',
    lockedTitle: 'הגעתם למגבלת כרטיסי הנאמנות',
    lockedSubtitle: (requiredPlanLabel) =>
      `כרטיסים נוספים ${availableOnPlan(requiredPlanLabel)}`,
    benefits: ['כמה תוכניות נאמנות במקביל', 'צמיחה בלי לעצור'],
    upgradeAreaLabel: 'מגבלת כרטיסים',
  },
  maxCustomers: {
    sectionTitle: 'מגבלת לקוחות',
    lockedTitle: 'הגעתם למגבלת מספר הלקוחות',
    lockedSubtitle: (requiredPlanLabel) =>
      `לקוחות נוספים ${availableOnPlan(requiredPlanLabel)}`,
    benefits: ['הרחבת בסיס הלקוחות', 'מניעת חסימה בגיוס לקוחות'],
    upgradeAreaLabel: 'מגבלת לקוחות',
  },
  maxActiveRetentionActions: {
    sectionTitle: 'מגבלת פעולות שימור',
    lockedTitle: 'הגעתם למגבלת פעולות שימור הלקוחות',
    lockedSubtitle: (requiredPlanLabel) =>
      `פעולות שימור נוספות ${availableOnPlan(requiredPlanLabel)}`,
    benefits: [
      'ב-Starter אין פעולות שימור אוטומטיות',
      'עד 5 ב-Pro ו-15 ב-Premium',
    ],
    upgradeAreaLabel: 'מגבלת פעולות שימור',
  },
  maxCampaigns: {
    sectionTitle: 'מגבלת קמפיינים',
    lockedTitle: 'הגעתם למגבלת מספר הקמפיינים הפעילים',
    lockedSubtitle: (requiredPlanLabel) =>
      `קמפיינים נוספים ${availableOnPlan(requiredPlanLabel)}`,
    benefits: [
      'המכסה כוללת קמפיינים ידניים ופעילות הזמנת חברים פעילה',
      'גמישות באוטומציה וקמפיינים',
    ],
    upgradeAreaLabel: 'מגבלת קמפיינים',
  },
  maxAiExecutionsPerMonth: {
    sectionTitle: 'מגבלת AI חודשית',
    lockedTitle: 'הגעתם למכסת שימושי AI לחודש הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `פעולות AI: 0 ב-Starter, 100 ב-Pro, 300 ב-Premium. ${availableOnPlan(
        requiredPlanLabel
      )}`,
    benefits: [
      'Starter: 0 \u00b7 Pro: 100 \u00b7 Premium: 300 פעולות AI בחודש',
      'המלצות חכמות וניסוח AI ללקוחות ולקמפיינים',
    ],
    upgradeAreaLabel: 'מגבלת AI חודשית',
  },
  maxTeamSeats: {
    sectionTitle: 'מגבלת מושבי צוות',
    lockedTitle: 'הגעתם למכסת מושבי הצוות',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `עובדים נוספים ${availableOnPlan(requiredPlanLabel)}`
        : 'כל מושבי הצוות במסלול הנוכחי כבר בשימוש',
    benefits: ['מושבי צוות נוספים לצמיחה', 'עד 5 ב-Pro ו-20 ב-Premium'],
    upgradeAreaLabel: 'מגבלת מושבי צוות',
  },
  business_subscription: {
    sectionTitle: 'מנוי וחיוב',
    lockedTitle: 'אפשרויות מתקדמות זמינות במסלול גבוה יותר',
    lockedSubtitle: () => 'יכולות נוספות זמינות במסלול מתקדם יותר',
    benefits: ['הרחבת מגבלות', 'המסלול קובע את היכולות הזמינות'],
    upgradeAreaLabel: 'מנוי וחיוב',
  },
  onboarding_plan_selection: {
    sectionTitle: 'בחירת מסלול',
    lockedTitle: 'בחירת מסלול משפיעה ישירות על היכולות',
    lockedSubtitle: () => 'המסלול הנוכחי קובע אילו יכולות זמינות',
    benefits: ['מגבלות ותכונות ברורות', 'מעבר פשוט למסלול מתקדם'],
    upgradeAreaLabel: 'בחירת מסלול',
  },
  generic: {
    sectionTitle: 'יכולות מתקדמות',
    lockedTitle: 'האזור הזה זמין במסלול מתקדם יותר',
    lockedSubtitle: (requiredPlanLabel) => availableOnPlan(requiredPlanLabel),
    benefits: ['הרחבת יכולות מוצר', 'המסלול קובע את היכולות הזמינות'],
    upgradeAreaLabel: 'יכולות מתקדמות',
  },
};

function resolveRequiredPlanLabel(requiredPlan: RequiredPlan): string | null {
  if (!requiredPlan || !PLAN_LABELS[requiredPlan]) {
    return null;
  }
  return PLAN_LABELS[requiredPlan];
}

function resolveLockedAreaKey(featureKey?: string | null): LockedAreaKey {
  if (!featureKey) {
    return 'generic';
  }
  const normalized = featureKey.trim();
  if (!normalized) {
    return 'generic';
  }
  return FEATURE_KEY_ALIAS_MAP[normalized] ?? 'generic';
}

export function getLockedAreaCopy(
  featureKey: string,
  requiredPlan?: RequiredPlan
) {
  const key = resolveLockedAreaKey(featureKey);
  const definition = LOCKED_AREA_COPY[key];
  const requiredPlanLabel = resolveRequiredPlanLabel(requiredPlan);
  return {
    ...definition,
    lockedSubtitle: definition.lockedSubtitle(requiredPlanLabel),
  };
}

export function getUpgradeAreaLabel(featureKey?: string | null) {
  const key = resolveLockedAreaKey(featureKey);
  return LOCKED_AREA_COPY[key].upgradeAreaLabel;
}
