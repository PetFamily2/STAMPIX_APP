import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { getEditConflictError } from '@/lib/errors/editConflicts';
import { tw } from '@/lib/rtl';

type BusinessServiceType =
  | 'food_drink'
  | 'beauty'
  | 'health_wellness'
  | 'fitness'
  | 'retail'
  | 'professional_services'
  | 'education'
  | 'hospitality'
  | 'other';

type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'app_store'
  | 'in_app'
  | 'other';

type ReasonId =
  | 'repeat'
  | 'replace_paper'
  | 'insights'
  | 'basket'
  | 'offers'
  | 'other';

type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';

type OwnerAgeRangeId =
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-54'
  | '55+'
  | 'not_specified';

type BusinessExampleId =
  | 'hair_salon'
  | 'cafe_restaurant'
  | 'greengrocer_retail_produce'
  | 'tire_shop_puncture'
  | 'clinic'
  | 'fitness_studio'
  | 'repair_maintenance'
  | 'other';

type ProfileCompletionField =
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

type EditingField =
  | 'name'
  | 'shortDescription'
  | 'businessPhone'
  | 'serviceTypes'
  | 'serviceTags'
  | 'discoverySource'
  | 'reason'
  | 'usageAreas'
  | 'ownerAgeRange'
  | 'businessExample'
  | 'birthdayCampaignRelevant'
  | 'joinAnniversaryCampaignRelevant'
  | 'weakTimePromosRelevant'
  | null;

const MISSING_VALUE = 'לא הוגדר';
const SERVICE_TYPE_LIMIT = 6;
const SERVICE_TAG_LIMIT = 8;
const SERVICE_TAG_MIN_LENGTH = 2;
const SERVICE_TAG_MAX_LENGTH = 24;

const SERVICE_TYPES: Array<{ id: BusinessServiceType; label: string }> = [
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

const DISCOVERY_SOURCES: Array<{ id: DiscoverySourceId; label: string }> = [
  { id: 'referral', label: 'המלצה מחבר/עסק' },
  { id: 'search', label: 'חיפוש בגוגל' },
  { id: 'social', label: 'רשתות חברתיות' },
  { id: 'tiktok', label: 'טיקטוק' },
  { id: 'app_store', label: 'חנות אפליקציות' },
  { id: 'in_app', label: 'דרך האפליקציה' },
  { id: 'other', label: 'אחר' },
];

const REASONS: Array<{ id: ReasonId; label: string }> = [
  { id: 'repeat', label: 'להגדיל חזרת לקוחות' },
  { id: 'replace_paper', label: 'להחליף כרטיסיות נייר' },
  { id: 'insights', label: 'לאסוף תובנות לקוחות' },
  { id: 'basket', label: 'להגדיל סל קנייה' },
  { id: 'offers', label: 'להפעיל מבצעים' },
  { id: 'other', label: 'אחר' },
];

const USAGE_AREAS: Array<{ id: UsageAreaId; label: string }> = [
  { id: 'nearby', label: 'באזור העסק' },
  { id: 'citywide', label: 'ברחבי העיר' },
  { id: 'online', label: 'באונליין' },
  { id: 'multiple', label: 'בכמה סניפים' },
];

const OWNER_AGE_RANGES: Array<{ id: OwnerAgeRangeId; label: string }> = [
  { id: '18-24', label: '18-24' },
  { id: '25-34', label: '25-34' },
  { id: '35-44', label: '35-44' },
  { id: '45-54', label: '45-54' },
  { id: '55+', label: '55+' },
  { id: 'not_specified', label: 'לא צוין' },
];

const BUSINESS_EXAMPLES: Array<{ id: BusinessExampleId; label: string }> = [
  { id: 'hair_salon', label: 'מספרה / סלון שיער' },
  { id: 'cafe_restaurant', label: 'קפה / מסעדה' },
  {
    id: 'greengrocer_retail_produce',
    label: 'ירקנייה / קמעונאות תוצרת',
  },
  { id: 'tire_shop_puncture', label: 'פנצ׳ריה / צמיגים' },
  { id: 'clinic', label: 'קליניקה' },
  { id: 'fitness_studio', label: 'סטודיו כושר' },
  { id: 'repair_maintenance', label: 'שירותי תיקון / תחזוקה' },
  { id: 'other', label: 'עסק אחר' },
];

const SERVICE_TYPE_SET = new Set<BusinessServiceType>(
  SERVICE_TYPES.map((item) => item.id)
);
const SERVICE_TYPE_LABELS = Object.fromEntries(
  SERVICE_TYPES.map((item) => [item.id, item.label])
) as Record<BusinessServiceType, string>;
const DISCOVERY_LABELS = Object.fromEntries(
  DISCOVERY_SOURCES.map((item) => [item.id, item.label])
) as Record<DiscoverySourceId, string>;
const REASON_LABELS = Object.fromEntries(
  REASONS.map((item) => [item.id, item.label])
) as Record<ReasonId, string>;
const USAGE_AREA_LABELS = Object.fromEntries(
  USAGE_AREAS.map((item) => [item.id, item.label])
) as Record<UsageAreaId, string>;
const OWNER_AGE_LABELS = Object.fromEntries(
  OWNER_AGE_RANGES.map((item) => [item.id, item.label])
) as Record<OwnerAgeRangeId, string>;
const BUSINESS_EXAMPLE_LABELS = Object.fromEntries(
  BUSINESS_EXAMPLES.map((item) => [item.id, item.label])
) as Record<BusinessExampleId, string>;

const MISSING_FIELD_LABELS: Record<ProfileCompletionField, string> = {
  businessExample: 'מיפוי סוג עסק',
  birthdayCampaignRelevant: 'רלוונטיות יום הולדת',
  joinAnniversaryCampaignRelevant: 'רלוונטיות יום הצטרפות',
  weakTimePromosRelevant: 'רלוונטיות שעות/ימים חלשים',
  name: 'שם העסק',
  shortDescription: 'תיאור קצר',
  businessPhone: 'טלפון עסקי',
  address: 'כתובת העסק',
  serviceTypes: 'סוגי שירות',
  serviceTags: 'תגיות שירות',
  discoverySource: 'מקור הגעה',
  reason: 'סיבת הצטרפות',
  usageAreas: 'אזורי פעילות',
  ownerAgeRange: 'טווח גיל בעלים',
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeServiceTypes(value: string[] | undefined) {
  const unique: BusinessServiceType[] = [];
  if (!value) return unique;
  for (const item of value) {
    if (!SERVICE_TYPE_SET.has(item as BusinessServiceType)) continue;
    const normalized = item as BusinessServiceType;
    if (!unique.includes(normalized)) unique.push(normalized);
    if (unique.length >= SERVICE_TYPE_LIMIT) break;
  }
  return unique;
}

function sanitizeServiceTags(value: string[] | undefined) {
  const unique: string[] = [];
  if (!value) return unique;
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
    if (unique.length >= SERVICE_TAG_LIMIT) break;
  }
  return unique;
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function ProfileRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.72 : pressed ? 0.86 : 1,
      })}
      className="min-h-[64px] border-b border-[#EDF2FF] py-2"
    >
      <View className={`${tw.flexRow} items-center justify-between gap-3`}>
        <View className="h-7 w-7 items-center justify-center rounded-full border border-[#DBEAFE] bg-[#F8FAFF]">
          <Ionicons
            name="create-outline"
            size={16}
            color={disabled ? '#94A3B8' : '#2563EB'}
          />
        </View>
        <View className="flex-1 items-end">
          <Text className="text-xs font-bold text-[#64748B]">{label}</Text>
          <Text className="mt-1 text-sm font-bold text-[#0F172A]">{value}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function BusinessSettingsProfileScreen() {
  const insets = useSafeAreaInsets();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canEditBusiness =
    activeBusinessCapabilities?.edit_business_profile === true;

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const updateBusinessProfile = useMutation(api.business.updateBusinessProfile);
  const saveBusinessOnboardingSnapshot = useMutation(
    api.business.saveBusinessOnboardingSnapshot
  );

  const [editingField, setEditingField] = useState<EditingField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [conflictLocked, setConflictLocked] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [serviceTypes, setServiceTypes] = useState<BusinessServiceType[]>([]);
  const [serviceTags, setServiceTags] = useState<string[]>([]);
  const [discoverySource, setDiscoverySource] =
    useState<DiscoverySourceId | null>(null);
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [usageAreas, setUsageAreas] = useState<UsageAreaId[]>([]);
  const [ownerAgeRange, setOwnerAgeRange] = useState<OwnerAgeRangeId | null>(
    null
  );
  const [businessExample, setBusinessExample] =
    useState<BusinessExampleId | null>(null);
  const [birthdayCampaignRelevant, setBirthdayCampaignRelevant] = useState<
    boolean | null
  >(null);
  const [joinAnniversaryCampaignRelevant, setJoinAnniversaryCampaignRelevant] =
    useState<boolean | null>(null);
  const [weakTimePromosRelevant, setWeakTimePromosRelevant] = useState<
    boolean | null
  >(null);

  const [draftText, setDraftText] = useState('');
  const [draftServiceTypes, setDraftServiceTypes] = useState<
    BusinessServiceType[]
  >([]);
  const [draftServiceTags, setDraftServiceTags] = useState<string[]>([]);
  const [draftTagInput, setDraftTagInput] = useState('');
  const [draftDiscoverySource, setDraftDiscoverySource] =
    useState<DiscoverySourceId | null>(null);
  const [draftReason, setDraftReason] = useState<ReasonId | null>(null);
  const [draftUsageAreas, setDraftUsageAreas] = useState<UsageAreaId[]>([]);
  const [draftOwnerAgeRange, setDraftOwnerAgeRange] =
    useState<OwnerAgeRangeId | null>(null);
  const [draftBusinessExample, setDraftBusinessExample] =
    useState<BusinessExampleId | null>(null);
  const [draftBirthdayCampaignRelevant, setDraftBirthdayCampaignRelevant] =
    useState<boolean | null>(null);
  const [
    draftJoinAnniversaryCampaignRelevant,
    setDraftJoinAnniversaryCampaignRelevant,
  ] = useState<boolean | null>(null);
  const [draftWeakTimePromosRelevant, setDraftWeakTimePromosRelevant] =
    useState<boolean | null>(null);

  const applyBusinessSettingsSnapshot = (settings: typeof businessSettings) => {
    if (!settings) {
      return;
    }
    setBusinessName(settings.name ?? '');
    setShortDescription(settings.shortDescription ?? '');
    setBusinessPhone(settings.businessPhone ?? '');
    setServiceTypes(sanitizeServiceTypes(settings.serviceTypes));
    setServiceTags(sanitizeServiceTags(settings.serviceTags));
    const snapshot = settings.onboardingSnapshot;
    setDiscoverySource(
      (snapshot?.discoverySource as DiscoverySourceId) ?? null
    );
    setReason((snapshot?.reason as ReasonId) ?? null);
    setUsageAreas((snapshot?.usageAreas as UsageAreaId[]) ?? []);
    setOwnerAgeRange((snapshot?.ownerAgeRange as OwnerAgeRangeId) ?? null);
    setBusinessExample(
      (snapshot?.businessExample as BusinessExampleId) ?? null
    );
    setBirthdayCampaignRelevant(
      snapshot?.birthdayCampaignRelevant === true ||
        snapshot?.birthdayCampaignRelevant === false
        ? snapshot.birthdayCampaignRelevant
        : null
    );
    setJoinAnniversaryCampaignRelevant(
      snapshot?.joinAnniversaryCampaignRelevant === true ||
        snapshot?.joinAnniversaryCampaignRelevant === false
        ? snapshot.joinAnniversaryCampaignRelevant
        : null
    );
    setWeakTimePromosRelevant(
      snapshot?.weakTimePromosRelevant === true ||
        snapshot?.weakTimePromosRelevant === false
        ? snapshot.weakTimePromosRelevant
        : null
    );
    setBaseUpdatedAt(
      typeof settings.updatedAt === 'number' ? settings.updatedAt : null
    );
    setConflictLocked(false);
  };

  useEffect(() => {
    setBaseUpdatedAt(null);
    setConflictLocked(false);
  }, [activeBusinessId]);

  useEffect(() => {
    if (!businessSettings || baseUpdatedAt !== null) {
      return;
    }
    applyBusinessSettingsSnapshot(businessSettings);
  }, [baseUpdatedAt, businessSettings]);

  const missingFieldLabels = useMemo(() => {
    const fields = (businessSettings?.profileCompletion?.missingFields ??
      []) as ProfileCompletionField[];
    return fields
      .filter(
        (item): item is ProfileCompletionField => item in MISSING_FIELD_LABELS
      )
      .map((item) => MISSING_FIELD_LABELS[item]);
  }, [businessSettings?.profileCompletion?.missingFields]);

  const rows = useMemo(
    () => [
      [
        'name',
        'שם העסק',
        normalizeText(businessName) || MISSING_VALUE,
      ] as const,
      [
        'shortDescription',
        'תיאור קצר',
        normalizeText(shortDescription) || MISSING_VALUE,
      ] as const,
      [
        'businessPhone',
        'טלפון עסקי',
        normalizeText(businessPhone) || MISSING_VALUE,
      ] as const,
      [
        'serviceTypes',
        'סוגי שירות',
        serviceTypes.length > 0
          ? serviceTypes.map((item) => SERVICE_TYPE_LABELS[item]).join(' • ')
          : MISSING_VALUE,
      ] as const,
      [
        'serviceTags',
        'תגיות שירות',
        serviceTags.length > 0 ? serviceTags.join(' • ') : MISSING_VALUE,
      ] as const,
      [
        'discoverySource',
        'מקור הגעה',
        discoverySource ? DISCOVERY_LABELS[discoverySource] : MISSING_VALUE,
      ] as const,
      [
        'reason',
        'סיבת הצטרפות',
        reason ? REASON_LABELS[reason] : MISSING_VALUE,
      ] as const,
      [
        'usageAreas',
        'אזורי פעילות',
        usageAreas.length > 0
          ? usageAreas.map((item) => USAGE_AREA_LABELS[item]).join(' • ')
          : MISSING_VALUE,
      ] as const,
      [
        'ownerAgeRange',
        'טווח גיל בעלים',
        ownerAgeRange ? OWNER_AGE_LABELS[ownerAgeRange] : MISSING_VALUE,
      ] as const,
      [
        'businessExample',
        'מיפוי סוג עסק',
        businessExample
          ? BUSINESS_EXAMPLE_LABELS[businessExample]
          : MISSING_VALUE,
      ] as const,
      [
        'birthdayCampaignRelevant',
        'רלוונטיות קמפיין יום הולדת',
        birthdayCampaignRelevant === null
          ? MISSING_VALUE
          : birthdayCampaignRelevant
            ? 'כן'
            : 'לא',
      ] as const,
      [
        'joinAnniversaryCampaignRelevant',
        'רלוונטיות קמפיין יום הצטרפות',
        joinAnniversaryCampaignRelevant === null
          ? MISSING_VALUE
          : joinAnniversaryCampaignRelevant
            ? 'כן'
            : 'לא',
      ] as const,
      [
        'weakTimePromosRelevant',
        'רלוונטיות קמפייני שעות/ימים חלשים',
        weakTimePromosRelevant === null
          ? MISSING_VALUE
          : weakTimePromosRelevant
            ? 'כן'
            : 'לא',
      ] as const,
    ],
    [
      birthdayCampaignRelevant,
      businessName,
      businessPhone,
      businessExample,
      discoverySource,
      joinAnniversaryCampaignRelevant,
      ownerAgeRange,
      reason,
      serviceTags,
      serviceTypes,
      shortDescription,
      usageAreas,
      weakTimePromosRelevant,
    ]
  );

  const openEditor = (field: EditingField) => {
    if (!field || !canEditBusiness) return;
    setEditingField(field);
    setDraftTagInput('');

    if (field === 'name') setDraftText(businessName);
    if (field === 'shortDescription') setDraftText(shortDescription);
    if (field === 'businessPhone') setDraftText(businessPhone);
    if (field === 'serviceTypes') setDraftServiceTypes(serviceTypes);
    if (field === 'serviceTags') setDraftServiceTags(serviceTags);
    if (field === 'discoverySource') setDraftDiscoverySource(discoverySource);
    if (field === 'reason') setDraftReason(reason);
    if (field === 'usageAreas') setDraftUsageAreas(usageAreas);
    if (field === 'ownerAgeRange') setDraftOwnerAgeRange(ownerAgeRange);
    if (field === 'businessExample') setDraftBusinessExample(businessExample);
    if (field === 'birthdayCampaignRelevant') {
      setDraftBirthdayCampaignRelevant(birthdayCampaignRelevant);
    }
    if (field === 'joinAnniversaryCampaignRelevant') {
      setDraftJoinAnniversaryCampaignRelevant(joinAnniversaryCampaignRelevant);
    }
    if (field === 'weakTimePromosRelevant') {
      setDraftWeakTimePromosRelevant(weakTimePromosRelevant);
    }
  };

  const closeEditor = () => {
    if (isSaving) return;
    setEditingField(null);
    setConflictLocked(false);
  };

  const buildProfilePayload = (overrides?: {
    name?: string;
    shortDescription?: string;
    businessPhone?: string;
    serviceTypes?: BusinessServiceType[];
    serviceTags?: string[];
  }) => ({
    name: normalizeText(overrides?.name ?? businessName),
    shortDescription: normalizeText(
      overrides?.shortDescription ?? shortDescription
    ),
    businessPhone: normalizeText(overrides?.businessPhone ?? businessPhone),
    serviceTypes: sanitizeServiceTypes(overrides?.serviceTypes ?? serviceTypes),
    serviceTags: sanitizeServiceTags(overrides?.serviceTags ?? serviceTags),
  });

  const addDraftTag = () => {
    const normalized = normalizeText(draftTagInput);
    if (!normalized) return;
    if (normalized.length < SERVICE_TAG_MIN_LENGTH) {
      Alert.alert('שגיאה', 'תגית חייבת להכיל לפחות 2 תווים.');
      return;
    }
    if (normalized.length > SERVICE_TAG_MAX_LENGTH) {
      Alert.alert('שגיאה', 'תגית יכולה להכיל עד 24 תווים.');
      return;
    }
    if (draftServiceTags.length >= SERVICE_TAG_LIMIT) {
      Alert.alert('שגיאה', 'ניתן להוסיף עד 8 תגיות.');
      return;
    }
    if (
      draftServiceTags.some(
        (tag) => tag.toLowerCase() === normalized.toLowerCase()
      )
    ) {
      setDraftTagInput('');
      return;
    }
    setDraftServiceTags((current) => [...current, normalized]);
    setDraftTagInput('');
  };

  const removeDraftTag = (tagToRemove: string) => {
    setDraftServiceTags((current) =>
      current.filter((tag) => tag.toLowerCase() !== tagToRemove.toLowerCase())
    );
  };

  const saveField = async () => {
    if (!activeBusinessId || !editingField) return;
    setIsSaving(true);
    try {
      if (
        editingField === 'name' ||
        editingField === 'shortDescription' ||
        editingField === 'businessPhone' ||
        editingField === 'serviceTypes' ||
        editingField === 'serviceTags'
      ) {
        const payload =
          editingField === 'name'
            ? buildProfilePayload({ name: draftText })
            : editingField === 'shortDescription'
              ? buildProfilePayload({ shortDescription: draftText })
              : editingField === 'businessPhone'
                ? buildProfilePayload({ businessPhone: draftText })
                : editingField === 'serviceTypes'
                  ? buildProfilePayload({ serviceTypes: draftServiceTypes })
                  : buildProfilePayload({ serviceTags: draftServiceTags });

        if (!payload.name) {
          Alert.alert('שגיאה', 'שם העסק הוא שדה חובה.');
          return;
        }

        const result = await updateBusinessProfile({
          businessId: activeBusinessId,
          expectedUpdatedAt: baseUpdatedAt ?? undefined,
          ...payload,
        });
        setBusinessName(payload.name);
        setShortDescription(payload.shortDescription);
        setBusinessPhone(payload.businessPhone);
        setServiceTypes(payload.serviceTypes);
        setServiceTags(payload.serviceTags);
        if (typeof result?.updatedAt === 'number') {
          setBaseUpdatedAt(result.updatedAt);
        }
      } else if (editingField === 'discoverySource') {
        if (!draftDiscoverySource) {
          Alert.alert('שגיאה', 'יש לבחור מקור הגעה.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          discoverySource: draftDiscoverySource,
        });
        setDiscoverySource(draftDiscoverySource);
      } else if (editingField === 'reason') {
        if (!draftReason) {
          Alert.alert('שגיאה', 'יש לבחור סיבת הצטרפות.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          reason: draftReason,
        });
        setReason(draftReason);
      } else if (editingField === 'usageAreas') {
        if (draftUsageAreas.length === 0) {
          Alert.alert('שגיאה', 'יש לבחור לפחות אזור פעילות אחד.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          usageAreas: draftUsageAreas,
        });
        setUsageAreas(draftUsageAreas);
      } else if (editingField === 'ownerAgeRange') {
        if (!draftOwnerAgeRange) {
          Alert.alert('שגיאה', 'יש לבחור טווח גיל.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          ownerAgeRange: draftOwnerAgeRange,
        });
        setOwnerAgeRange(draftOwnerAgeRange);
      } else if (editingField === 'businessExample') {
        if (!draftBusinessExample) {
          Alert.alert('שגיאה', 'יש לבחור מיפוי עסק.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          businessExample: draftBusinessExample,
        });
        setBusinessExample(draftBusinessExample);
      } else if (editingField === 'birthdayCampaignRelevant') {
        if (draftBirthdayCampaignRelevant === null) {
          Alert.alert('שגיאה', 'יש לבחור האם קמפיין יום הולדת רלוונטי.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          birthdayCampaignRelevant: draftBirthdayCampaignRelevant,
        });
        setBirthdayCampaignRelevant(draftBirthdayCampaignRelevant);
      } else if (editingField === 'joinAnniversaryCampaignRelevant') {
        if (draftJoinAnniversaryCampaignRelevant === null) {
          Alert.alert('שגיאה', 'יש לבחור האם קמפיין יום הצטרפות רלוונטי.');
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          joinAnniversaryCampaignRelevant: draftJoinAnniversaryCampaignRelevant,
        });
        setJoinAnniversaryCampaignRelevant(
          draftJoinAnniversaryCampaignRelevant
        );
      } else if (editingField === 'weakTimePromosRelevant') {
        if (draftWeakTimePromosRelevant === null) {
          Alert.alert(
            'שגיאה',
            'יש לבחור האם קמפייני שעות/ימים חלשים רלוונטיים.'
          );
          return;
        }
        await saveBusinessOnboardingSnapshot({
          businessId: activeBusinessId,
          weakTimePromosRelevant: draftWeakTimePromosRelevant,
        });
        setWeakTimePromosRelevant(draftWeakTimePromosRelevant);
      }
      setEditingField(null);
      setConflictLocked(false);
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים עודכנו',
          'נמצאה גרסה חדשה של פרטי העסק. אפשר לטעון את הנתונים העדכניים או להשאיר את הטיוטה המקומית.',
          [
            {
              text: 'Reload latest',
              onPress: () => {
                applyBusinessSettingsSnapshot(businessSettings);
                setEditingField(null);
              },
            },
            {
              text: 'Keep my draft',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('שגיאה', toErrorMessage(error, 'שמירת הנתון נכשלה.'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderChoiceRow = (
    selected: boolean,
    label: string,
    onPress: () => void
  ) => (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl border px-3 py-3 ${
        selected
          ? 'border-[#9EC5FF] bg-[#EAF1FF]'
          : 'border-[#E2E8F0] bg-[#F8FAFF]'
      }`}
    >
      <View className={`${tw.flexRow} items-center justify-between gap-2`}>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={18}
          color={selected ? '#1D4ED8' : '#64748B'}
        />
        <Text className="flex-1 text-right text-sm font-bold text-[#1E293B]">
          {label}
        </Text>
      </View>
    </Pressable>
  );

  if (!activeBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-sm text-[#64748B]">
          לא נמצא עסק פעיל.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 12,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="פרופיל עסק"
            subtitle="נתוני העסק מהאונבורדינג והשלמת פרטים חסרים"
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        {businessSettings === undefined ? (
          <View className="items-center rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : businessSettings === null ? (
          <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
            <Text className="text-right text-sm text-[#64748B]">
              לא נמצאו נתוני עסק להצגה.
            </Text>
          </View>
        ) : (
          <>
            {!businessSettings.profileCompletion?.isComplete ? (
              <View className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-4">
                <View className={`${tw.flexRow} items-center gap-2`}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={18}
                    color="#B45309"
                  />
                  <Text className="text-sm font-extrabold text-[#92400E]">
                    השלם פרטים
                  </Text>
                </View>
                <Text className="mt-1 text-right text-xs text-[#78350F]">
                  שדות חסרים:{' '}
                  {missingFieldLabels.join(' • ') || 'יש להשלים נתונים'}
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-[#A7F3D0] bg-[#ECFDF5] p-3">
                <View className={`${tw.flexRow} items-center gap-2`}>
                  <Ionicons name="checkmark-circle" size={18} color="#047857" />
                  <Text className="text-sm font-bold text-[#065F46]">
                    פרופיל העסק מלא ומעודכן.
                  </Text>
                </View>
              </View>
            )}

            <View className="rounded-3xl border border-[#E3E9FF] bg-white px-4 py-2">
              <Pressable
                disabled={!canEditBusiness}
                onPress={() =>
                  router.push(
                    '/(authenticated)/(business)/settings-business-address'
                  )
                }
                style={({ pressed }) => ({
                  opacity: !canEditBusiness ? 0.72 : pressed ? 0.86 : 1,
                })}
                className="min-h-[64px] border-b border-[#EDF2FF] py-2"
              >
                <View
                  className={`${tw.flexRow} items-center justify-between gap-3`}
                >
                  <View className="h-7 w-7 items-center justify-center rounded-full border border-[#DBEAFE] bg-[#F8FAFF]">
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={canEditBusiness ? '#2563EB' : '#94A3B8'}
                    />
                  </View>
                  <View className="flex-1 items-end">
                    <Text className="text-xs font-bold text-[#64748B]">
                      כתובת העסק
                    </Text>
                    <Text className="mt-1 text-sm font-bold text-[#0F172A]">
                      {normalizeText(businessSettings.formattedAddress) ||
                        MISSING_VALUE}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {rows.map(([field, label, value]) => (
                <ProfileRow
                  key={field}
                  label={label}
                  value={value}
                  disabled={!canEditBusiness}
                  onPress={() => openEditor(field)}
                />
              ))}
            </View>

            {!canEditBusiness ? (
              <Text className="text-right text-xs text-[#64748B]">
                עריכת נתוני העסק זמינה לבעלים או למנהל בלבד.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        transparent={true}
        visible={editingField !== null}
        animationType="fade"
        onRequestClose={closeEditor}
      >
        <Pressable
          onPress={closeEditor}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.38)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            className="rounded-3xl border border-[#DCE6FF] bg-white p-4"
          >
            {(editingField === 'name' ||
              editingField === 'shortDescription' ||
              editingField === 'businessPhone') && (
              <>
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  {editingField === 'name'
                    ? 'עריכת שם העסק'
                    : editingField === 'shortDescription'
                      ? 'עריכת תיאור קצר'
                      : 'עריכת טלפון עסקי'}
                </Text>
                <TextInput
                  value={draftText}
                  onChangeText={setDraftText}
                  placeholder={
                    editingField === 'name'
                      ? 'שם העסק'
                      : editingField === 'shortDescription'
                        ? 'תיאור קצר'
                        : 'טלפון עסקי'
                  }
                  placeholderTextColor="#94A3B8"
                  keyboardType={
                    editingField === 'businessPhone' ? 'phone-pad' : 'default'
                  }
                  multiline={editingField === 'shortDescription'}
                  textAlignVertical={
                    editingField === 'shortDescription' ? 'top' : 'center'
                  }
                  maxLength={
                    editingField === 'shortDescription'
                      ? 220
                      : editingField === 'businessPhone'
                        ? 24
                        : 80
                  }
                  className={`mt-3 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A] ${
                    editingField === 'shortDescription' ? 'min-h-[100px]' : ''
                  }`}
                />
              </>
            )}

            {editingField === 'serviceTypes' && (
              <>
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  בחירת סוגי שירות
                </Text>
                <Text className="mt-1 text-right text-xs text-[#64748B]">
                  ניתן לבחור עד 6 סוגים
                </Text>
                <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
                  {SERVICE_TYPES.map((option) => {
                    const isSelected = draftServiceTypes.includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setDraftServiceTypes((current) => {
                            if (current.includes(option.id)) {
                              return current.filter(
                                (item) => item !== option.id
                              );
                            }
                            if (current.length >= SERVICE_TYPE_LIMIT) {
                              Alert.alert('שגיאה', 'ניתן לבחור עד 6 סוגים.');
                              return current;
                            }
                            return [...current, option.id];
                          });
                        }}
                        className={`rounded-2xl border px-3 py-2 ${
                          isSelected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-[#1D4ED8]' : 'text-[#475569]'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {editingField === 'serviceTags' && (
              <>
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  עריכת תגיות שירות
                </Text>
                <View className={`${tw.flexRow} mt-3 gap-2`}>
                  <Pressable
                    onPress={addDraftTag}
                    className="rounded-xl bg-[#2F6BFF] px-4 py-3"
                  >
                    <Text className="text-xs font-bold text-white">הוסף</Text>
                  </Pressable>
                  <TextInput
                    value={draftTagInput}
                    onChangeText={setDraftTagInput}
                    placeholder="תגית חדשה"
                    placeholderTextColor="#94A3B8"
                    maxLength={SERVICE_TAG_MAX_LENGTH}
                    className="flex-1 rounded-xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                </View>
                <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
                  {draftServiceTags.map((tag) => (
                    <View
                      key={tag}
                      className={`${tw.flexRow} items-center gap-2 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-3 py-2`}
                    >
                      <Pressable onPress={() => removeDraftTag(tag)}>
                        <Text className="text-xs font-black text-[#DC2626]">
                          ?
                        </Text>
                      </Pressable>
                      <Text className="text-xs font-semibold text-[#1E293B]">
                        {tag}
                      </Text>
                    </View>
                  ))}
                  {draftServiceTags.length === 0 ? (
                    <Text className="text-xs text-[#64748B]">אין תגיות</Text>
                  ) : null}
                </View>
              </>
            )}

            {editingField === 'discoverySource' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  בחירת מקור הגעה
                </Text>
                {DISCOVERY_SOURCES.map((option) =>
                  renderChoiceRow(
                    draftDiscoverySource === option.id,
                    option.label,
                    () => setDraftDiscoverySource(option.id)
                  )
                )}
              </View>
            )}

            {editingField === 'reason' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  בחירת סיבת הצטרפות
                </Text>
                {REASONS.map((option) =>
                  renderChoiceRow(draftReason === option.id, option.label, () =>
                    setDraftReason(option.id)
                  )
                )}
              </View>
            )}

            {editingField === 'usageAreas' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  בחירת אזורי פעילות
                </Text>
                <Text className="text-right text-xs text-[#64748B]">
                  יש לבחור לפחות אזור אחד
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  {USAGE_AREAS.map((option) => {
                    const isSelected = draftUsageAreas.includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() =>
                          setDraftUsageAreas((current) =>
                            current.includes(option.id)
                              ? current.filter((item) => item !== option.id)
                              : [...current, option.id]
                          )
                        }
                        className={`rounded-2xl border px-3 py-2 ${
                          isSelected
                            ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                            : 'border-[#DCE6F7] bg-[#F8FAFF]'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-[#1D4ED8]' : 'text-[#475569]'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {editingField === 'ownerAgeRange' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  בחירת טווח גיל בעלים
                </Text>
                {OWNER_AGE_RANGES.map((option) =>
                  renderChoiceRow(
                    draftOwnerAgeRange === option.id,
                    option.label,
                    () => setDraftOwnerAgeRange(option.id)
                  )
                )}
              </View>
            )}

            {editingField === 'businessExample' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  מיפוי סוג עסק
                </Text>
                {BUSINESS_EXAMPLES.map((option) =>
                  renderChoiceRow(
                    draftBusinessExample === option.id,
                    option.label,
                    () => setDraftBusinessExample(option.id)
                  )
                )}
              </View>
            )}

            {editingField === 'birthdayCampaignRelevant' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  האם קמפיין יום הולדת רלוונטי לעסק?
                </Text>
                {renderChoiceRow(
                  draftBirthdayCampaignRelevant === true,
                  'כן',
                  () => setDraftBirthdayCampaignRelevant(true)
                )}
                {renderChoiceRow(
                  draftBirthdayCampaignRelevant === false,
                  'לא',
                  () => setDraftBirthdayCampaignRelevant(false)
                )}
              </View>
            )}

            {editingField === 'joinAnniversaryCampaignRelevant' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  האם קמפיין יום הצטרפות רלוונטי לעסק?
                </Text>
                {renderChoiceRow(
                  draftJoinAnniversaryCampaignRelevant === true,
                  'כן',
                  () => setDraftJoinAnniversaryCampaignRelevant(true)
                )}
                {renderChoiceRow(
                  draftJoinAnniversaryCampaignRelevant === false,
                  'לא',
                  () => setDraftJoinAnniversaryCampaignRelevant(false)
                )}
              </View>
            )}

            {editingField === 'weakTimePromosRelevant' && (
              <View className="gap-2">
                <Text className="text-right text-base font-extrabold text-[#111827]">
                  האם קמפייני שעות/ימים חלשים רלוונטיים לעסק?
                </Text>
                {renderChoiceRow(
                  draftWeakTimePromosRelevant === true,
                  'כן',
                  () => setDraftWeakTimePromosRelevant(true)
                )}
                {renderChoiceRow(
                  draftWeakTimePromosRelevant === false,
                  'לא',
                  () => setDraftWeakTimePromosRelevant(false)
                )}
              </View>
            )}

            {conflictLocked ? (
              <View className="mt-4 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-3 py-3">
                <Text className="text-right text-xs text-[#92400E]">
                  נמצאה גרסה חדשה של הנתונים. השמירה נעולה עד לטעינת הגרסה
                  העדכנית.
                </Text>
                <Pressable
                  onPress={() => {
                    applyBusinessSettingsSnapshot(businessSettings);
                  }}
                  className="mt-2 self-end rounded-full bg-[#F59E0B] px-3 py-1.5"
                >
                  <Text className="text-xs font-bold text-white">
                    Reload latest
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className={`${tw.flexRow} mt-4 gap-2`}>
              <Pressable
                onPress={closeEditor}
                disabled={isSaving}
                className="flex-1 items-center justify-center rounded-xl border border-[#CBD5E1] bg-white py-3"
              >
                <Text className="text-sm font-bold text-[#334155]">ביטול</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveField();
                }}
                disabled={isSaving || conflictLocked}
                className={`flex-1 items-center justify-center rounded-xl py-3 ${
                  isSaving || conflictLocked ? 'bg-[#CBD5E1]' : 'bg-[#2F6BFF]'
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-sm font-bold text-white">שמירה</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
