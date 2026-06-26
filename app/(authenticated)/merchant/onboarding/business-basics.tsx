import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { flexDirection } from '@/lib/rtl';

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

const SERVICE_TYPE_LIMIT = 6;
const SERVICE_TAG_LIMIT = 8;
const SERVICE_TAG_MIN_LENGTH = 2;
const SERVICE_TAG_MAX_LENGTH = 24;
const SHORT_DESCRIPTION_MAX_LENGTH = 220;
const BUSINESS_PHONE_MAX_LENGTH = 24;

const TEXT = {
  title: 'פרטי העסק לפני פרסום',
  subtitle: 'הפרטים האלה יוצגו ללקוחות ודרושים כדי לפרסם את הכרטיסיה הראשונה.',
  shortDescriptionLabel: 'תיאור קצר של העסק',
  shortDescriptionPlaceholder: 'לדוגמה: סטודיו בוטיק לטיפולי פנים בתל אביב',
  phoneLabel: 'טלפון עסקי',
  phonePlaceholder: '050-123-4567',
  serviceTypesLabel: 'סוגי שירות',
  serviceTypesHelper: 'בחרו לפחות סוג אחד, עד 6 סוגים.',
  serviceTagsLabel: 'תגיות שירות',
  serviceTagsHelper: 'הוסיפו לפחות תגית אחת, למשל מניקור, קפה, אימון אישי.',
  tagPlaceholder: 'תגית חדשה',
  addTag: 'הוסף',
  continue: 'שמירה והמשך לתצוגה מקדימה',
  submitting: 'שומרים פרטי עסק',
  missingBusiness: 'נדרש עסק פעיל לפני המשך.',
  missingName: 'שם העסק חסר. חזרו לשלב שם העסק ונסו שוב.',
  shortDescriptionRequired: 'יש להזין תיאור קצר לעסק.',
  phoneRequired: 'יש להזין טלפון עסקי.',
  phoneInvalid: 'מספר הטלפון יכול לכלול ספרות, רווחים, +, מקפים וסוגריים.',
  serviceTypesRequired: 'יש לבחור לפחות סוג שירות אחד.',
  serviceTagsRequired: 'יש להוסיף לפחות תגית שירות אחת.',
  tagTooShort: 'תגית חייבת להכיל לפחות 2 תווים.',
  tagTooLong: 'תגית יכולה להכיל עד 24 תווים.',
  tooManyTags: 'ניתן להוסיף עד 8 תגיות.',
  loadError: 'לא הצלחנו לטעון את פרטי העסק.',
  saveError: 'שמירת פרטי העסק נכשלה. נסו שוב.',
};

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

const SERVICE_TYPE_SET = new Set<BusinessServiceType>(
  SERVICE_TYPES.map((item) => item.id)
);

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeServiceTypes(value: string[] | undefined) {
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

function sanitizeServiceTags(value: string[] | undefined) {
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

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default function BusinessBasicsScreen() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const {
    businessDraft,
    businessOnboardingDraft,
    setBusinessOnboardingDraft,
    businessId,
    programId,
  } = useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const didHydrateRef = useRef(false);

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    businessId ? { businessId } : 'skip'
  );
  const updateBusinessProfile = useMutation(api.business.updateBusinessProfile);

  const [shortDescription, setShortDescription] = useState(
    businessOnboardingDraft.shortDescription
  );
  const [businessPhone, setBusinessPhone] = useState(
    businessOnboardingDraft.businessPhone
  );
  const [serviceTypes, setServiceTypes] = useState<BusinessServiceType[]>(
    sanitizeServiceTypes(businessOnboardingDraft.serviceTypes)
  );
  const [serviceTags, setServiceTags] = useState<string[]>(
    sanitizeServiceTags(businessOnboardingDraft.serviceTags)
  );
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'businessBasics', flow }).catch(() => {});
  }, [flow, saveStep]);

  useEffect(() => {
    if (!businessId) {
      safePush(
        withBusinessOnboardingFlow(
          BUSINESS_ONBOARDING_ROUTES.createBusiness,
          flow
        )
      );
      return;
    }

    if (!programId) {
      safePush(
        withBusinessOnboardingFlow(
          BUSINESS_ONBOARDING_ROUTES.createProgram,
          flow
        )
      );
    }
  }, [businessId, flow, programId]);

  useEffect(() => {
    if (!businessSettings || didHydrateRef.current) {
      return;
    }
    didHydrateRef.current = true;

    const nextShortDescription =
      businessOnboardingDraft.shortDescription.trim() ||
      businessSettings.shortDescription ||
      '';
    const nextBusinessPhone =
      businessOnboardingDraft.businessPhone.trim() ||
      businessSettings.businessPhone ||
      '';
    const nextServiceTypes =
      sanitizeServiceTypes(businessOnboardingDraft.serviceTypes).length > 0
        ? sanitizeServiceTypes(businessOnboardingDraft.serviceTypes)
        : sanitizeServiceTypes(businessSettings.serviceTypes);
    const nextServiceTags =
      sanitizeServiceTags(businessOnboardingDraft.serviceTags).length > 0
        ? sanitizeServiceTags(businessOnboardingDraft.serviceTags)
        : sanitizeServiceTags(businessSettings.serviceTags);

    setShortDescription(nextShortDescription);
    setBusinessPhone(nextBusinessPhone);
    setServiceTypes(nextServiceTypes);
    setServiceTags(nextServiceTags);
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      shortDescription: nextShortDescription,
      businessPhone: nextBusinessPhone,
      serviceTypes: nextServiceTypes,
      serviceTags: nextServiceTags,
    }));
  }, [businessOnboardingDraft, businessSettings, setBusinessOnboardingDraft]);

  const businessName = useMemo(
    () => normalizeText(businessSettings?.name ?? businessDraft.name),
    [businessDraft.name, businessSettings?.name]
  );

  const canSubmit =
    Boolean(businessId) &&
    Boolean(programId) &&
    Boolean(businessName) &&
    Boolean(normalizeText(shortDescription)) &&
    Boolean(normalizeText(businessPhone)) &&
    serviceTypes.length > 0 &&
    serviceTags.length > 0 &&
    businessSettings !== undefined &&
    !isSubmitting;

  const updateDraft = (patch: {
    shortDescription?: string;
    businessPhone?: string;
    serviceTypes?: BusinessServiceType[];
    serviceTags?: string[];
  }) => {
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const handleShortDescriptionChange = (value: string) => {
    setShortDescription(value);
    updateDraft({ shortDescription: value });
    setError(null);
  };

  const handlePhoneChange = (value: string) => {
    setBusinessPhone(value);
    updateDraft({ businessPhone: value });
    setError(null);
  };

  const commitServiceTypes = (nextServiceTypes: BusinessServiceType[]) => {
    setServiceTypes(nextServiceTypes);
    updateDraft({ serviceTypes: nextServiceTypes });
    setError(null);
  };

  const commitServiceTags = (nextServiceTags: string[]) => {
    setServiceTags(nextServiceTags);
    updateDraft({ serviceTags: nextServiceTags });
    setError(null);
  };

  const toggleServiceType = (serviceType: BusinessServiceType) => {
    if (serviceTypes.includes(serviceType)) {
      commitServiceTypes(
        serviceTypes.filter((current) => current !== serviceType)
      );
      return;
    }
    if (serviceTypes.length >= SERVICE_TYPE_LIMIT) {
      return;
    }
    commitServiceTypes([...serviceTypes, serviceType]);
  };

  const addTag = () => {
    const normalized = normalizeText(tagInput);
    if (!normalized) {
      return;
    }
    if (normalized.length < SERVICE_TAG_MIN_LENGTH) {
      setError(TEXT.tagTooShort);
      return;
    }
    if (normalized.length > SERVICE_TAG_MAX_LENGTH) {
      setError(TEXT.tagTooLong);
      return;
    }
    if (serviceTags.length >= SERVICE_TAG_LIMIT) {
      setError(TEXT.tooManyTags);
      return;
    }
    if (
      serviceTags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())
    ) {
      setTagInput('');
      return;
    }
    commitServiceTags([...serviceTags, normalized]);
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    commitServiceTags(
      serviceTags.filter(
        (tag) => tag.toLowerCase() !== tagToRemove.toLowerCase()
      )
    );
  };

  const validate = () => {
    const normalizedShortDescription = normalizeText(shortDescription);
    const normalizedPhone = normalizeText(businessPhone);
    const normalizedServiceTags = sanitizeServiceTags(serviceTags);

    if (!businessId) {
      return TEXT.missingBusiness;
    }
    if (!businessName) {
      return TEXT.missingName;
    }
    if (!normalizedShortDescription) {
      return TEXT.shortDescriptionRequired;
    }
    if (!normalizedPhone) {
      return TEXT.phoneRequired;
    }
    if (!/^[0-9+()\-\s]+$/.test(normalizedPhone)) {
      return TEXT.phoneInvalid;
    }
    if (serviceTypes.length === 0) {
      return TEXT.serviceTypesRequired;
    }
    if (normalizedServiceTags.length === 0) {
      return TEXT.serviceTagsRequired;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!businessId) {
      setError(TEXT.missingBusiness);
      return;
    }

    const normalizedShortDescription = normalizeText(shortDescription);
    const normalizedPhone = normalizeText(businessPhone);
    const normalizedServiceTypes = sanitizeServiceTypes(serviceTypes);
    const normalizedServiceTags = sanitizeServiceTags(serviceTags);

    setError(null);
    setIsSubmitting(true);
    try {
      await updateBusinessProfile({
        businessId,
        expectedUpdatedAt:
          typeof businessSettings?.updatedAt === 'number'
            ? businessSettings.updatedAt
            : undefined,
        name: businessName,
        shortDescription: normalizedShortDescription,
        businessPhone: normalizedPhone,
        serviceTypes: normalizedServiceTypes,
        serviceTags: normalizedServiceTags,
      });

      updateDraft({
        shortDescription: normalizedShortDescription,
        businessPhone: normalizedPhone,
        serviceTypes: normalizedServiceTypes,
        serviceTags: normalizedServiceTags,
      });

      try {
        await saveStep({ step: 'businessBasics', flow });
      } catch {
        // Keep onboarding moving even if draft persistence fails.
      }

      safePush(
        withBusinessOnboardingFlow(BUSINESS_ONBOARDING_ROUTES.previewCard, flow)
      );
    } catch (submitError) {
      setError(toErrorMessage(submitError, TEXT.saveError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(
                withBusinessOnboardingFlow(
                  BUSINESS_ONBOARDING_ROUTES.createProgram,
                  flow
                )
              )
            }
          />
          <OnboardingProgress
            total={getBusinessOnboardingTotalSteps(flow)}
            current={getBusinessOnboardingProgressStep('businessBasics', flow)}
          />
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{TEXT.title}</Text>
            <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
          </View>

          {businessSettings === undefined ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : businessSettings === null ? (
            <Text style={styles.errorText}>{TEXT.loadError}</Text>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>{TEXT.shortDescriptionLabel}</Text>
                <TextInput
                  value={shortDescription}
                  onChangeText={handleShortDescriptionChange}
                  placeholder={TEXT.shortDescriptionPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  maxLength={SHORT_DESCRIPTION_MAX_LENGTH}
                  multiline={true}
                  textAlignVertical="top"
                  style={[styles.input, styles.multilineInput]}
                  accessibilityLabel={TEXT.shortDescriptionLabel}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{TEXT.phoneLabel}</Text>
                <TextInput
                  value={businessPhone}
                  onChangeText={handlePhoneChange}
                  placeholder={TEXT.phonePlaceholder}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  maxLength={BUSINESS_PHONE_MAX_LENGTH}
                  style={styles.input}
                  accessibilityLabel={TEXT.phoneLabel}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{TEXT.serviceTypesLabel}</Text>
                <Text style={styles.helper}>{TEXT.serviceTypesHelper}</Text>
                <View style={styles.optionsWrap}>
                  {SERVICE_TYPES.map((option) => {
                    const selected = serviceTypes.includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => toggleServiceType(option.id)}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipOn : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextOn : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{TEXT.serviceTagsLabel}</Text>
                <Text style={styles.helper}>{TEXT.serviceTagsHelper}</Text>
                <View style={styles.tagInputRow}>
                  <Pressable onPress={addTag} style={styles.addTagButton}>
                    <Text style={styles.addTagText}>{TEXT.addTag}</Text>
                  </Pressable>
                  <TextInput
                    value={tagInput}
                    onChangeText={(value) => {
                      setTagInput(value);
                      setError(null);
                    }}
                    placeholder={TEXT.tagPlaceholder}
                    placeholderTextColor="#9CA3AF"
                    maxLength={SERVICE_TAG_MAX_LENGTH}
                    style={[styles.input, styles.tagInput]}
                    onSubmitEditing={addTag}
                    accessibilityLabel={TEXT.tagPlaceholder}
                  />
                </View>
                <View style={styles.optionsWrap}>
                  {serviceTags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => removeTag(tag)}
                      style={styles.tagChip}
                    >
                      <Text style={styles.tagRemoveText}>×</Text>
                      <Text style={styles.tagText}>{tag}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {isSubmitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.submittingText}>{TEXT.submitting}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            label={TEXT.continue}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formScroll: {
    marginTop: 12,
    flex: 1,
  },
  formContent: {
    gap: 14,
    paddingBottom: 18,
  },
  titleContainer: {
    alignItems: 'flex-end',
    gap: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  loadingCard: {
    minHeight: 90,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    padding: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontWeight: '700',
  },
  multilineInput: {
    minHeight: 96,
  },
  optionsWrap: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D6E2F8',
    borderRadius: 999,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionChipOn: {
    borderColor: '#2563EB',
    backgroundColor: '#EAF1FF',
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A2B4A',
  },
  optionChipTextOn: {
    color: '#1D4ED8',
  },
  tagInputRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  addTagButton: {
    borderRadius: 14,
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addTagText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  tagInput: {
    flex: 1,
  },
  tagChip: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D6E2F8',
    borderRadius: 999,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  tagRemoveText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DC2626',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  submittingRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  submittingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    marginTop: 10,
  },
});
