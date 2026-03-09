export type RequiredPlan = 'starter' | 'pro' | 'premium' | null | undefined;

export type LockedAreaKey =
  | 'team'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'advancedReports'
  | 'segmentationBuilder'
  | 'savedSegments'
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
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
  pro: 'Pro AI',
  premium: 'Premium AI',
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
  segmentationBuilder: 'segmentationBuilder',
  canUseAdvancedSegmentation: 'segmentationBuilder',
  savedSegments: 'savedSegments',
  maxCards: 'maxCards',
  maxCustomers: 'maxCustomers',
  maxActiveRetentionActions: 'maxActiveRetentionActions',
  business_subscription: 'business_subscription',
  onboarding_plan_selection: 'onboarding_plan_selection',
};

const LOCKED_AREA_COPY: Record<LockedAreaKey, LockedAreaDefinition> = {
  team: {
    sectionTitle: 'ניהול צוות',
    lockedTitle: 'ניהול צוות נעול במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `הזמנת עובדים והרשאות גישה זמינות במסלול ${requiredPlanLabel ?? 'מתקדם יותר'}.`,
    benefits: [
      'הזמנת עובדים ישירות מתוך האפליקציה',
      'ניהול הרשאות לפי תפקיד',
      'עבודה מסודרת עם הצוות',
    ],
    upgradeAreaLabel: 'ניהול צוות',
  },
  marketingHub: {
    sectionTitle: 'מרכז שימור',
    lockedTitle: 'מרכז השימור זמין במסלול מתקדם יותר',
    lockedSubtitle: (requiredPlanLabel) =>
      `פעולות שימור מבוססות הזדמנויות זמינות במסלול ${requiredPlanLabel ?? 'מתקדם יותר'}.`,
    benefits: [
      'קבוצות הזדמנות לפי מצב לקוח',
      'פעולות Push והודעות בתוך האפליקציה',
      'הצעות ניסוח בעזרת AI',
    ],
    upgradeAreaLabel: 'מרכז שימור',
  },
  smartAnalytics: {
    sectionTitle: 'תובנות לקוחות',
    lockedTitle: 'תובנות לקוחות נעולות במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `ניתוח מתקדם של לקוחות זמין במסלול ${requiredPlanLabel ?? 'מתקדם יותר'}.`,
    benefits: [
      'זיהוי לקוחות בסיכון',
      'איתור לקוחות קרובים לתגמול',
      'נראות של VIP ולקוחות חדשים',
    ],
    upgradeAreaLabel: 'תובנות לקוחות',
  },
  advancedReports: {
    sectionTitle: 'דוחות מתקדמים',
    lockedTitle: 'דוחות מתקדמים נעולים במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      `דוחות עומק זמינים במסלול ${requiredPlanLabel ?? 'מתקדם יותר'}.`,
    benefits: [
      'דוחות מגמות ברמת העסק',
      'השוואות בין תקופות',
      'קריאה מהירה של ביצועים',
    ],
    upgradeAreaLabel: 'דוחות מתקדמים',
  },
  segmentationBuilder: {
    sectionTitle: 'בונה סגמנטים',
    lockedTitle: 'בונה הסגמנטים זמין במסלול Premium AI',
    lockedSubtitle: () =>
      'אפשר ליצור קהלים לפי תנאים פשוטים, לצפות בתוצאה מראש ולשמור לשימוש חוזר.',
    benefits: [
      'פילוח לפי ביקור אחרון, תדירות והתקדמות נאמנות',
      'תצוגה מקדימה לפני שמירה',
      'שימוש חוזר בקהלים בפעולות שימור',
    ],
    upgradeAreaLabel: 'בונה סגמנטים',
  },
  savedSegments: {
    sectionTitle: 'סגמנטים שמורים',
    lockedTitle: 'סגמנטים שמורים זמינים במסלול Premium AI',
    lockedSubtitle: () =>
      'שמירת קהלים מאפשרת להפעיל פעולות שימור ממוקדות מהר יותר.',
    benefits: [
      'שמירת קהלים לשימוש עתידי',
      'גישה מהירה לסגמנטים מוכנים',
      'חיבור ישיר לזרימות שימור',
    ],
    upgradeAreaLabel: 'סגמנטים שמורים',
  },
  maxCards: {
    sectionTitle: 'מגבלת כרטיסים',
    lockedTitle: 'הגעתם למגבלת הכרטיסים במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר לפתוח עוד כרטיסי נאמנות.`
        : 'שדרוג למסלול מתקדם יותר יאפשר לפתוח עוד כרטיסי נאמנות.',
    benefits: [
      'יותר תוכניות נאמנות במקביל',
      'התאמה לסוגי לקוחות שונים',
      'צמיחה בלי לעצור פתיחת כרטיסים חדשים',
    ],
    upgradeAreaLabel: 'מגבלת כרטיסים',
  },
  maxCustomers: {
    sectionTitle: 'מגבלת לקוחות',
    lockedTitle: 'הגעתם למגבלת הלקוחות במסלול הנוכחי',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר להמשיך לצרף לקוחות.`
        : 'שדרוג למסלול מתקדם יותר יאפשר להמשיך לצרף לקוחות.',
    benefits: [
      'הגדלת בסיס הלקוחות הפעיל',
      'צירוף לקוחות חדשים ללא חסימה',
      'המשך צמיחה רציפה של העסק',
    ],
    upgradeAreaLabel: 'מגבלת לקוחות',
  },
  maxActiveRetentionActions: {
    sectionTitle: 'מגבלת קמפייני שימור פעילים',
    lockedTitle: 'הגעתם למגבלת קמפייני השימור הפעילים',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יאפשר להפעיל יותר קמפיינים במקביל.`
        : 'שדרוג למסלול מתקדם יותר יאפשר להפעיל יותר קמפיינים במקביל.',
    benefits: [
      'שליטה טובה יותר בעומס המסרים',
      'יותר אוטומציות שימור פעילות בו-זמנית',
      'ניהול ברור של קמפיינים פעילים',
    ],
    upgradeAreaLabel: 'מגבלת קמפייני שימור פעילים',
  },
  business_subscription: {
    sectionTitle: 'מנוי וחיוב',
    lockedTitle: 'אפשרויות מתקדמות זמינות במסלול גבוה יותר',
    lockedSubtitle: () => 'שדרוג המסלול יפתח מגבלות ושכבות ניהול מתקדמות.',
    benefits: [
      'יותר יכולות ניהול עסקי',
      'הגדלת מגבלות שימוש',
      'תאימות בין מוצר, מסכים ותמחור',
    ],
    upgradeAreaLabel: 'מנוי וחיוב',
  },
  onboarding_plan_selection: {
    sectionTitle: 'בחירת מסלול',
    lockedTitle: 'בחירת המסלול משפיעה ישירות על היכולות',
    lockedSubtitle: () => 'אפשר להתחיל ב-Starter ולשדרג בכל שלב.',
    benefits: [
      'מגבלות ותכונות ברורות לכל מסלול',
      'מעבר פשוט למסלול מתקדם יותר',
      'שקיפות מלאה למה כלול בכל מסלול',
    ],
    upgradeAreaLabel: 'בחירת מסלול',
  },
  generic: {
    sectionTitle: 'יכולות מתקדמות',
    lockedTitle: 'האזור הזה זמין במסלול מתקדם יותר',
    lockedSubtitle: (requiredPlanLabel) =>
      requiredPlanLabel
        ? `שדרוג למסלול ${requiredPlanLabel} יפתח את היכולת הזו.`
        : 'שדרוג למסלול מתקדם יותר יפתח את היכולת הזו.',
    benefits: [
      'הרחבת יכולות ניהול ושימור',
      'כלים מתקדמים לפי שלב הצמיחה',
      'שימוש יעיל יותר במוצר',
    ],
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
