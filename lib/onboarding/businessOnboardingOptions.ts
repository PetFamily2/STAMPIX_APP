import type { Ionicons } from '@expo/vector-icons';

export type BusinessExampleId =
  | 'hair_salon'
  | 'cafe_restaurant'
  | 'greengrocer_retail_produce'
  | 'tire_shop_puncture'
  | 'clinic'
  | 'fitness_studio'
  | 'repair_maintenance'
  | 'other';

export type BusinessCadenceId =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'irregular';

export const CADENCE_LABELS: Record<BusinessCadenceId, string> = {
  daily: 'יומי',
  weekly: 'שבועי',
  biweekly: 'דו-שבועי',
  monthly: 'חודשי',
  quarterly: 'רבעוני',
  irregular: 'לא קבוע',
};

export const BUSINESS_EXAMPLES: Array<{
  id: BusinessExampleId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'hair_salon',
    title: 'מספרה / סלון שיער',
    icon: 'cut-outline',
  },
  {
    id: 'cafe_restaurant',
    title: 'קפה / מסעדה',
    icon: 'restaurant-outline',
  },
  {
    id: 'greengrocer_retail_produce',
    title: 'ירקניה / קמעונאות תוצרת',
    icon: 'leaf-outline',
  },
  {
    id: 'tire_shop_puncture',
    title: 'פנצ' + 'ריה / צמיגים',
    icon: 'car-sport-outline',
  },
  {
    id: 'clinic',
    title: 'קליניקה',
    icon: 'medkit-outline',
  },
  {
    id: 'fitness_studio',
    title: 'סטודיו כושר',
    icon: 'barbell-outline',
  },
  {
    id: 'repair_maintenance',
    title: 'שירותי תיקון / תחזוקה',
    icon: 'construct-outline',
  },
  {
    id: 'other',
    title: 'עסק אחר',
    icon: 'apps-outline',
  },
];

export const BUSINESS_EXAMPLE_DEFAULTS: Record<
  BusinessExampleId,
  {
    cadenceBand: BusinessCadenceId;
    birthdayCampaignRelevant: boolean;
    joinAnniversaryCampaignRelevant: boolean;
    weakTimePromosRelevant: boolean;
  }
> = {
  hair_salon: {
    cadenceBand: 'monthly',
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: true,
    weakTimePromosRelevant: true,
  },
  cafe_restaurant: {
    cadenceBand: 'weekly',
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
  greengrocer_retail_produce: {
    cadenceBand: 'weekly',
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
  tire_shop_puncture: {
    cadenceBand: 'irregular',
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  clinic: {
    cadenceBand: 'quarterly',
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  fitness_studio: {
    cadenceBand: 'weekly',
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: true,
    weakTimePromosRelevant: true,
  },
  repair_maintenance: {
    cadenceBand: 'quarterly',
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  other: {
    cadenceBand: 'monthly',
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
};

export const BUSINESS_EXAMPLE_CADENCE_OPTIONS: Record<
  BusinessExampleId,
  BusinessCadenceId[]
> = {
  hair_salon: ['biweekly', 'monthly', 'quarterly'],
  cafe_restaurant: ['daily', 'weekly', 'biweekly'],
  greengrocer_retail_produce: ['weekly', 'biweekly', 'monthly'],
  tire_shop_puncture: ['quarterly', 'irregular'],
  clinic: ['monthly', 'quarterly', 'irregular'],
  fitness_studio: ['weekly', 'biweekly', 'monthly'],
  repair_maintenance: ['quarterly', 'irregular'],
  other: ['weekly', 'monthly', 'quarterly', 'irregular'],
};
