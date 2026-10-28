export const CAMPAIGN_WIZARD_GOALS = [
  {
    type: 'promo',
    label: 'עדכון או מבצע',
    audience: 'כל חברי המועדון הפעילים',
  },
  {
    type: 'winback',
    label: 'החזרת לקוחות',
    audience: 'לקוחות שלא ביקרו לאחרונה',
  },
  {
    type: 'welcome',
    label: 'קבלת לקוחות חדשים',
    audience: 'לקוחות שהצטרפו לאחרונה',
  },
  {
    type: 'birthday',
    label: 'יום הולדת',
    audience: 'לקוחות שחוגגים היום יום הולדת',
  },
  {
    type: 'anniversary',
    label: 'יום נישואין',
    audience: 'לקוחות שחוגגים היום יום נישואין',
  },
] as const;

export type WizardCampaignType = (typeof CAMPAIGN_WIZARD_GOALS)[number]['type'];
export type CampaignWizardInput = {
  type: WizardCampaignType;
  days: string;
  title: string;
  messageTitle: string;
  messageBody: string;
};

export function wizardInitialCopy(type: WizardCampaignType) {
  const goal = CAMPAIGN_WIZARD_GOALS.find((entry) => entry.type === type);
  return {
    title: goal?.label ?? 'קמפיין חדש',
    messageTitle: type === 'winback' ? 'מתגעגעים אליכם' : 'עדכון מהמועדון שלנו',
    messageBody:
      type === 'winback'
        ? 'לא ראינו אתכם לאחרונה ונשמח לראותכם שוב. מחכים לכם בביקור הבא!'
        : 'נשמח לראותכם בביקור הבא. כאן אפשר להוסיף את פרטי העדכון שלכם.',
  };
}

export function wizardStepError(step: number, input: CampaignWizardInput) {
  if (!CAMPAIGN_WIZARD_GOALS.some((goal) => goal.type === input.type)) {
    return 'בחרו מטרה לקמפיין.';
  }
  if (step >= 2 && (input.type === 'winback' || input.type === 'welcome')) {
    const days = Number(input.days);
    if (!/^\d+$/.test(input.days) || days < 1 || days > 365) {
      return 'בחרו מספר שלם של ימים בין 1 ל־365.';
    }
  }
  if (step >= 3) {
    if (!input.title.trim() || input.title.trim().length > 60) {
      return 'שם הקמפיין נדרש, עד 60 תווים.';
    }
    if (!input.messageTitle.trim() || input.messageTitle.trim().length > 60) {
      return 'כותרת ההודעה נדרשת, עד 60 תווים.';
    }
    if (
      input.messageBody.trim().length < 3 ||
      input.messageBody.trim().length > 400
    ) {
      return 'תוכן ההודעה צריך להכיל בין 3 ל־400 תווים.';
    }
  }
  return null;
}

export function buildWizardCampaignDraft(input: CampaignWizardInput) {
  const error = wizardStepError(5, input);
  if (error) {
    throw new Error(error);
  }
  const days = Number(input.days);
  const rules =
    input.type === 'winback'
      ? { audience: 'inactive_days' as const, daysInactive: days }
      : input.type === 'welcome'
        ? { audience: 'new_customers' as const, joinedWithinDays: days }
        : input.type === 'birthday'
          ? { audience: 'birthday_today' as const }
          : input.type === 'anniversary'
            ? { audience: 'anniversary_today' as const }
            : { audience: 'all_active_members' as const };
  return {
    type: input.type,
    title: input.title.trim(),
    messageTitle: input.messageTitle.trim(),
    messageBody: input.messageBody.trim(),
    rules,
  };
}
