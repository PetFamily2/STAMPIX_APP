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
      `הזמנת עובדים זמינה במסלול ${requiredPlanLabel ?? 'מתקדם יותר'}.`,
    benefits: ['הזמנת עובדים וניהול הרשאות', 'עבודה מסודרת עם צוות'],
    upgradeAreaLabel: 'ניהול צוות',
  },
  marketingHub: {
    sectionTitle: 'מרכז הקמפיינים',
    lockedTitle: 'מרכז הקמפיינים מוגבל במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `קמפיינים ידניים זמינים לפי מכסת המסלול. שדרוג למסלול ${requiredPlanLabel} מגדיל מכסות ויכולות AI.`
        : 'קמפיינים ידניים זמינים לפי מכסת המסלול. AI מתקדם מחייב מסלול Pro.',
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
      }.`,
    benefits: [
      'רשימת לקוחות וניהול בסיסי \u2014 בכל המסלולים',
      'זיהוי לקוחות בסיכון ותובנות לצמיחה',
    ],
    upgradeAreaLabel: 'תובנות לקוחות',
  },
  advancedReports: {
    sectionTitle: 'דוחות מתקדמים',
    lockedTitle: 'דוחות מתקדמים \u2014 בקרוב',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `השוואת תקופות ומגמות עומק ייפתחו במסלול ${requiredPlanLabel}. כרגע אין מסך דוחות פעיל באפליקציה.`
        : 'השוואת תקופות ומגמות עומק יגיעו בקרוב למסלול Pro. כרגע אין מסך דוחות פעיל באפליקציה.',
    benefits: [
      'השוואת תקופות ומגמות ביצועים \u2014 בקרוב',
      'זמין במסלול Pro ומעלה; השק באפליקציה בהמשך',
    ],
    upgradeAreaLabel: 'דוחות מתקדמים',
  },
  maxCards: {
    sectionTitle: 'מגבלת כרטיסים',
    lockedTitle: 'הגעתם למגבלת כרטיסי הנאמנות',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר פתיחת כרטיסים נוספים.`
        : 'שדרוג למסלול מתקדם יותר יאפשר פתיחת כרטיסים נוספים.',
    benefits: ['כמה תוכניות נאמנות במקביל', 'צמיחה בלי לעצור'],
    upgradeAreaLabel: 'מגבלת כרטיסים',
  },
  maxCustomers: {
    sectionTitle: 'מגבלת לקוחות',
    lockedTitle: 'הגעתם למגבלת מספר הלקוחות',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר צירוף לקוחות נוספים.`
        : 'שדרוג למסלול מתקדם יותר יאפשר צירוף לקוחות נוספים.',
    benefits: ['הרחבת בסיס הלקוחות', 'מניעת חסימה בגיוס לקוחות'],
    upgradeAreaLabel: 'מגבלת לקוחות',
  },
  maxActiveRetentionActions: {
    sectionTitle: 'מגבלת פעולות שימור',
    lockedTitle: 'הגעתם למגבלת פעולות שימור הלקוחות',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר הפעלת יותר פעולות שימור אוטומטיות.`
        : 'שדרוג למסלול מתקדם יפתח אוטומציות שימור נוספות.',
    benefits: ['ב-Starter אין פעולות שימור אוטומטיות', 'עד 5 ב-Pro ו-15 ב-Premium'],
    upgradeAreaLabel: 'מגבלת פעולות שימור',
  },
  maxCampaigns: {
    sectionTitle: 'מגבלת קמפיינים',
    lockedTitle: 'הגעתם למגבלת מספר הקמפיינים הפעילים',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יוסיף מקומות לקמפיינים ידניים ולפעילות הזמנת חברים פעילה.`
        : 'שדרוג למסלול מתקדם יותר יוסיף מקומות לקמפיינים ידניים ולפעילות הזמנת חברים פעילה.',
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
      requiredPlanLabel
        ? `פעולות AI מתחילות ממסלול Pro (0 ב-Starter, 100 ב-Pro, 300 ב-Premium). שדרוג למסלול ${requiredPlanLabel} מגדיל מכסת AI חודשית.`
        : 'פעולות AI מתחילות ממסלול Pro (0 ב-Starter, 100 ב-Pro, 300 ב-Premium). שדרוג למסלול מתקדם מגדיל מכסת AI חודשית.',
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
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר להוסיף עובדים נוספים.`
        : 'כל מושבי הצוות במסלול הנוכחי כבר בשימוש.',
    benefits: ['מושבי צוות נוספים לצמיחה', 'עד 5 ב-Pro ו-20 ב-Premium'],
    upgradeAreaLabel: 'מגבלת מושבי צוות',
  },
  business_subscription: {
    sectionTitle: 'מנוי וחיוב',
    lockedTitle: 'אפשרויות מתקדמות זמינות במסלול גבוה יותר',
    lockedSubtitle: () => 'שדרוג מסלול יפתח מגבלות ויכולות מתקדמות.',
    benefits: ['הרחבת מגבלות', 'עבור למסלול מתאים לצמיחה'],
    upgradeAreaLabel: 'מנוי וחיוב',
  },
  onboarding_plan_selection: {
    sectionTitle: 'בחירת מסלול',
    lockedTitle: 'בחירת מסלול משפיעה ישירות על היכולות',
    lockedSubtitle: () => 'אפשר להתחיל ב-Starter ולשדרג בכל שלב.',
    benefits: ['מגבלות ותכונות ברורות', 'מעבר פשוט למסלול מתקדם'],
    upgradeAreaLabel: 'בחירת מסלול',
  },
  generic: {
    sectionTitle: 'יכולות מתקדמות',
    lockedTitle: 'האזור הזה זמין במסלול מתקדם יותר',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יפתח את היכולת הזו.`
        : 'שדרוג למסלול מתקדם יותר יפתח את היכולת הזו.',
    benefits: ['הרחבת יכולות מוצר', 'מעבר למסלול מתאים לצמיחה'],
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
