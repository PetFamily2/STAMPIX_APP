import {
  isProfileCompletionField,
  PROFILE_FIELD_LABELS,
  type ProfileCompletionField,
} from '@/lib/businessSettings/profileFields';

export type CompletionStepGroupId =
  | 'basics'
  | 'address'
  | 'services'
  | 'preferences'
  | 'setup';

export type CompletionStep = {
  id: CompletionStepGroupId;
  title: string;
  fields: ProfileCompletionField[];
  stepIndex: number;
  totalSteps: number;
};

const COMPLETION_GROUPS: Array<{
  id: CompletionStepGroupId;
  title: string;
  fields: ProfileCompletionField[];
}> = [
  {
    id: 'basics',
    title: 'פרטים בסיסיים',
    fields: ['name', 'shortDescription', 'businessPhone'],
  },
  {
    id: 'address',
    title: 'כתובת העסק',
    fields: ['address'],
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
  {
    id: 'setup',
    title: 'פרטים משלימים',
    fields: ['discoverySource', 'reason', 'ownerAgeRange'],
  },
];

export function parseMissingProfileFields(value: readonly unknown[] | undefined) {
  if (!value) {
    return [] as ProfileCompletionField[];
  }
  return value.filter(isProfileCompletionField);
}

export function buildCompletionSteps(
  missingFields: readonly unknown[] | undefined
): CompletionStep[] {
  const missing = new Set(parseMissingProfileFields(missingFields));
  const groups = COMPLETION_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    fields: group.fields.filter((field) => missing.has(field)),
  })).filter((group) => group.fields.length > 0);

  return groups.map((group, index) => ({
    ...group,
    stepIndex: index + 1,
    totalSteps: groups.length,
  }));
}

export function formatMissingFieldsCountLabel(count: number) {
  if (count <= 0) {
    return '';
  }
  if (count === 1) {
    return 'נותר פרט אחד להשלמה';
  }
  return `נותרו ${count} פרטים להשלמה`;
}

export function formatProfileCompletionTitle(count: number) {
  if (count <= 0) {
    return '';
  }
  if (count <= 4) {
    return 'הפרופיל כמעט מוכן';
  }
  return 'השלמת פרטי העסק';
}

export function formatMissingFieldLabels(
  missingFields: readonly unknown[] | undefined
) {
  return parseMissingProfileFields(missingFields).map(
    (field) => PROFILE_FIELD_LABELS[field]
  );
}

export function formatCompletionProgressLabel(step: CompletionStep) {
  return `שלב ${step.stepIndex} מתוך ${step.totalSteps}`;
}
