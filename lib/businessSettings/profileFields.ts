import { BUSINESS_EXAMPLES } from '@/lib/onboarding/businessOnboardingOptions';

export type BusinessServiceType =
  | 'food_drink'
  | 'beauty'
  | 'health_wellness'
  | 'fitness'
  | 'retail'
  | 'professional_services'
  | 'education'
  | 'hospitality'
  | 'other';

export type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'app_store'
  | 'in_app'
  | 'other';

export type ReasonId =
  | 'repeat'
  | 'replace_paper'
  | 'insights'
  | 'basket'
  | 'offers'
  | 'other';

export type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';

export type OwnerAgeRangeId =
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-54'
  | '55+'
  | 'not_specified';

export type BusinessExampleId =
  | 'hair_salon'
  | 'cafe_restaurant'
  | 'greengrocer_retail_produce'
  | 'tire_shop_puncture'
  | 'clinic'
  | 'fitness_studio'
  | 'repair_maintenance'
  | 'other';

export type ProfileCompletionField =
  | 'name'
  | 'shortDescription'
  | 'businessPhone'
  | 'address'
  | 'serviceTypes'
  | 'serviceTags'
  | 'discoverySource'
  | 'reason'
  | 'usageAreas'
  | 'ownerAgeRange'
  | 'businessExample'
  | 'birthdayCampaignRelevant'
  | 'joinAnniversaryCampaignRelevant'
  | 'weakTimePromosRelevant';

export type EverydayProfileField = Exclude<
  ProfileCompletionField,
  'discoverySource' | 'reason' | 'ownerAgeRange'
>;

export type OnboardingAnalyticsField =
  | 'discoverySource'
  | 'reason'
  | 'ownerAgeRange';

export const MISSING_VALUE = 'לא הוגדר';
export const SERVICE_TYPE_LIMIT = 6;
export const SERVICE_TAG_LIMIT = 8;
export const SERVICE_TAG_MIN_LENGTH = 2;
export const SERVICE_TAG_MAX_LENGTH = 24;
export const BUSINESS_NAME_MAX_LENGTH = 80;
export const SHORT_DESCRIPTION_MAX_LENGTH = 220;
export const BUSINESS_PHONE_MAX_LENGTH = 24;

export const SERVICE_TYPES: Array<{ id: BusinessServiceType; label: string }> =
  [
    { id: 'food_drink', label: 'מזון ומשקאות' },
    { id: 'beauty', label: 'יופי וטיפוח' },
    { id: 'health_wellness', label: 'בריאות ורווחה' },
    { id: 'fitness', label: 'כושר וספורט' },
    { id: 'retail', label: 'קמעונאות' },
    { id: 'professional_services', label: 'שירותים מקצועיים' },
    { id: 'education', label: 'לימודים והדרכה' },
    { id: 'hospitality', label: 'אירוח ופנאי' },
    { id: 'other', label: 'אחר' },
  ];

export const DISCOVERY_SOURCES: Array<{
  id: DiscoverySourceId;
  label: string;
}> = [
  { id: 'referral', label: 'המלצה מחבר/עסק' },
  { id: 'search', label: 'חיפוש בגוגל' },
  { id: 'social', label: 'רשתות חברתיות' },
  { id: 'tiktok', label: 'טיקטוק' },
  { id: 'app_store', label: 'חנות אפליקציות' },
  { id: 'in_app', label: 'דרך האפליקציה' },
  { id: 'other', label: 'אחר' },
];

export const REASONS: Array<{ id: ReasonId; label: string }> = [
  { id: 'repeat', label: 'להגדיל חזרת לקוחות' },
  { id: 'replace_paper', label: 'להחליף כרטיסיות נייר' },
  { id: 'insights', label: 'לאסוף תובנות לקוחות' },
  { id: 'basket', label: 'להגדיל סל קנייה' },
  { id: 'offers', label: 'להפעיל מבצעים' },
  { id: 'other', label: 'אחר' },
];

export const USAGE_AREAS: Array<{ id: UsageAreaId; label: string }> = [
  { id: 'nearby', label: 'באזור העסק' },
  { id: 'citywide', label: 'ברחבי העיר' },
  { id: 'online', label: 'באונליין' },
  { id: 'multiple', label: 'בכמה סניפים' },
];

export const OWNER_AGE_RANGES: Array<{ id: OwnerAgeRangeId; label: string }> = [
  { id: '18-24', label: '18-24' },
  { id: '25-34', label: '25-34' },
  { id: '35-44', label: '35-44' },
  { id: '45-54', label: '45-54' },
  { id: '55+', label: '55+' },
  { id: 'not_specified', label: 'לא צוין' },
];

export const BUSINESS_EXAMPLE_OPTIONS: Array<{
  id: BusinessExampleId;
  label: string;
}> = BUSINESS_EXAMPLES.map((item) => ({
  id: item.id,
  label: item.title,
}));

const SERVICE_TYPE_SET = new Set<BusinessServiceType>(
  SERVICE_TYPES.map((item) => item.id)
);

export const SERVICE_TYPE_LABELS = Object.fromEntries(
  SERVICE_TYPES.map((item) => [item.id, item.label])
) as Record<BusinessServiceType, string>;

export const DISCOVERY_LABELS = Object.fromEntries(
  DISCOVERY_SOURCES.map((item) => [item.id, item.label])
) as Record<DiscoverySourceId, string>;

export const REASON_LABELS = Object.fromEntries(
  REASONS.map((item) => [item.id, item.label])
) as Record<ReasonId, string>;

export const USAGE_AREA_LABELS = Object.fromEntries(
  USAGE_AREAS.map((item) => [item.id, item.label])
) as Record<UsageAreaId, string>;

export const OWNER_AGE_LABELS = Object.fromEntries(
  OWNER_AGE_RANGES.map((item) => [item.id, item.label])
) as Record<OwnerAgeRangeId, string>;

export const BUSINESS_EXAMPLE_LABELS = Object.fromEntries(
  BUSINESS_EXAMPLE_OPTIONS.map((item) => [item.id, item.label])
) as Record<BusinessExampleId, string>;

export const PROFILE_FIELD_LABELS: Record<ProfileCompletionField, string> = {
  name: 'שם העסק',
  shortDescription: 'תיאור קצר',
  businessPhone: 'טלפון עסקי',
  address: 'כתובת העסק',
  serviceTypes: 'סוגי שירות',
  serviceTags: 'תגיות שירות',
  usageAreas: 'אזורי פעילות',
  businessExample: 'תחום העסק',
  birthdayCampaignRelevant: 'מבצעי יום הולדת',
  joinAnniversaryCampaignRelevant: 'מבצעי יום הצטרפות',
  weakTimePromosRelevant: 'מבצעים בשעות חלשות',
  discoverySource: 'איך שמעתם עלינו',
  reason: 'מה חשוב לכם בעסק',
  ownerAgeRange: 'טווח גיל',
};

export const PROFILE_FIELD_EDITOR_TITLES: Record<
  ProfileCompletionField,
  string
> = {
  name: 'שם העסק',
  shortDescription: 'תיאור קצר',
  businessPhone: 'טלפון עסקי',
  address: 'כתובת העסק',
  serviceTypes: 'סוגי שירות',
  serviceTags: 'תגיות שירות',
  usageAreas: 'אזורי פעילות',
  businessExample: 'תחום העסק',
  birthdayCampaignRelevant: 'האם מבצע יום הולדת רלוונטי לעסק?',
  joinAnniversaryCampaignRelevant: 'האם מבצע יום הצטרפות רלוונטי לעסק?',
  weakTimePromosRelevant: 'האם מבצעי שעות/ימים חלשים רלוונטיים לעסק?',
  discoverySource: 'איך שמעתם על StampAix?',
  reason: 'מה המטרה העיקרית שלכם?',
  ownerAgeRange: 'טווח גיל',
};

export const ONBOARDING_ANALYTICS_FIELDS: readonly OnboardingAnalyticsField[] =
  ['discoverySource', 'reason', 'ownerAgeRange'];

export const EVERYDAY_PROFILE_GROUPS: Array<{
  id: 'basics' | 'services' | 'preferences';
  title: string;
  fields: EverydayProfileField[];
}> = [
  {
    id: 'basics',
    title: 'פרטים בסיסיים',
    fields: ['name', 'shortDescription', 'businessPhone', 'address'],
  },
  {
    id: 'services',
    title: 'העסק והשירותים',
    fields: ['businessExample', 'serviceTypes', 'serviceTags', 'usageAreas'],
  },
  {
    id: 'preferences',
    title: 'העדפות עסקיות',
    fields: [
      'birthdayCampaignRelevant',
      'joinAnniversaryCampaignRelevant',
      'weakTimePromosRelevant',
    ],
  },
];

export function isProfileCompletionField(
  value: unknown
): value is ProfileCompletionField {
  return typeof value === 'string' && value in PROFILE_FIELD_LABELS;
}

export function isOnboardingAnalyticsField(
  value: unknown
): value is OnboardingAnalyticsField {
  return (
    value === 'discoverySource' ||
    value === 'reason' ||
    value === 'ownerAgeRange'
  );
}

export function isEverydayProfileField(
  value: unknown
): value is EverydayProfileField {
  return isProfileCompletionField(value) && !isOnboardingAnalyticsField(value);
}

export function sanitizeServiceTypes(value: string[] | undefined) {
  const unique: BusinessServiceType[] = [];
  if (!value) {
    return unique;
  }
  for (const item of value) {
    if (!SERVICE_TYPE_SET.has(item as BusinessServiceType)) {
      continue;
    }
    const normalized = item as BusinessServiceType;
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
    if (unique.length >= SERVICE_TYPE_LIMIT) {
      break;
    }
  }
  return unique;
}

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function sanitizeServiceTags(value: string[] | undefined) {
  const unique: string[] = [];
  if (!value) {
    return unique;
  }
  for (const item of value) {
    const normalized = normalizeText(item);
    if (
      normalized.length < SERVICE_TAG_MIN_LENGTH ||
      normalized.length > SERVICE_TAG_MAX_LENGTH
    ) {
      continue;
    }
    if (!unique.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
      unique.push(normalized);
    }
    if (unique.length >= SERVICE_TAG_LIMIT) {
      break;
    }
  }
  return unique;
}

export function formatBooleanChoice(value: boolean | null) {
  if (value === true) {
    return 'כן';
  }
  if (value === false) {
    return 'לא';
  }
  return MISSING_VALUE;
}

export function formatProfileFieldValue(
  field: ProfileCompletionField,
  input: {
    name: string;
    shortDescription: string;
    businessPhone: string;
    formattedAddress: string;
    serviceTypes: BusinessServiceType[];
    serviceTags: string[];
    usageAreas: UsageAreaId[];
    businessExample: BusinessExampleId | null;
    birthdayCampaignRelevant: boolean | null;
    joinAnniversaryCampaignRelevant: boolean | null;
    weakTimePromosRelevant: boolean | null;
    discoverySource: DiscoverySourceId | null;
    reason: ReasonId | null;
    ownerAgeRange: OwnerAgeRangeId | null;
  }
) {
  switch (field) {
    case 'name':
      return normalizeText(input.name) || MISSING_VALUE;
    case 'shortDescription':
      return normalizeText(input.shortDescription) || MISSING_VALUE;
    case 'businessPhone':
      return normalizeText(input.businessPhone) || MISSING_VALUE;
    case 'address':
      return normalizeText(input.formattedAddress) || MISSING_VALUE;
    case 'serviceTypes':
      return input.serviceTypes.length > 0
        ? input.serviceTypes.map((item) => SERVICE_TYPE_LABELS[item]).join(' • ')
        : MISSING_VALUE;
    case 'serviceTags':
      return input.serviceTags.length > 0
        ? input.serviceTags.join(' • ')
        : MISSING_VALUE;
    case 'usageAreas':
      return input.usageAreas.length > 0
        ? input.usageAreas.map((item) => USAGE_AREA_LABELS[item]).join(' • ')
        : MISSING_VALUE;
    case 'businessExample':
      return input.businessExample
        ? BUSINESS_EXAMPLE_LABELS[input.businessExample]
        : MISSING_VALUE;
    case 'birthdayCampaignRelevant':
      return formatBooleanChoice(input.birthdayCampaignRelevant);
    case 'joinAnniversaryCampaignRelevant':
      return formatBooleanChoice(input.joinAnniversaryCampaignRelevant);
    case 'weakTimePromosRelevant':
      return formatBooleanChoice(input.weakTimePromosRelevant);
    case 'discoverySource':
      return input.discoverySource
        ? DISCOVERY_LABELS[input.discoverySource]
        : MISSING_VALUE;
    case 'reason':
      return input.reason ? REASON_LABELS[input.reason] : MISSING_VALUE;
    case 'ownerAgeRange':
      return input.ownerAgeRange
        ? OWNER_AGE_LABELS[input.ownerAgeRange]
        : MISSING_VALUE;
    default:
      return MISSING_VALUE;
  }
}
