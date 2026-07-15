import { useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BusinessAddressSelector from '@/components/business/BusinessAddressSelector';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { trackActivationEvent } from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { isValidSelectedBusinessAddress, type SelectedBusinessAddress } from '@/lib/businessAddressSelection';
import {
  consumePendingJoin,
  savePendingJoin,
} from '@/lib/deeplink/pendingJoin';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  isAdditionalBusinessFlow,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { alignItems, flexDirection } from '@/lib/rtl';

const TEXT = {
  title: 'כתובת ומיקום העסק',
  subtitle: 'בחרו עסק או כתובת מהרשימה ואשרו שהסמן נמצא במקום הנכון.',
  searchLabel: 'חיפוש עסק או כתובת',
  continue: 'יצירת העסק והמשך לכרטיסייה',
  creating: 'יוצרים עסק...',
  missingBasics:
    'חסרים פרטי עסק. חזרו לשלב פרטי העסק והשלימו את כל השדות.',
  addressRequired: 'יש לבחור תוצאה מהרשימה לפני ההמשך.',
  createError: 'יצירת העסק נכשלה. נסו שוב.',
};

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

const SERVICE_TYPES = new Set<BusinessServiceType>([
  'food_drink',
  'beauty',
  'health_wellness',
  'fitness',
  'retail',
  'professional_services',
  'education',
  'hospitality',
  'other',
]);

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function buildExternalId(name: string, userId?: string) {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const ownerSuffix = userId ? stableHash(userId).slice(0, 8) : 'draft';
  return `${slug || `business-${stableHash(name)}`}-${ownerSuffix}`;
}

function sanitizeServiceTypes(values: string[]) {
  const unique: BusinessServiceType[] = [];
  for (const value of values) {
    if (!SERVICE_TYPES.has(value as BusinessServiceType)) {
      continue;
    }
    const typed = value as BusinessServiceType;
    if (!unique.includes(typed)) {
      unique.push(typed);
    }
  }
  return unique;
}

function toSelectedAddress(draft: {
  placeId: string;
  formattedAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  city: string;
  street: string;
  streetNumber: string;
}): SelectedBusinessAddress | null {
  if (
    !draft.placeId.trim() ||
    !draft.formattedAddress.trim() ||
    typeof draft.locationLat !== 'number' ||
    typeof draft.locationLng !== 'number'
  ) {
    return null;
  }

  return {
    placeId: draft.placeId,
    formattedAddress: draft.formattedAddress,
    latitude: draft.locationLat,
    longitude: draft.locationLng,
    city: draft.city,
    street: draft.street,
    streetNumber: draft.streetNumber,
  };
}

export default function CreateBusinessScreen() {
  const {
    businessDraft,
    setBusinessDraft,
    businessId,
    setBusinessId,
    businessOnboardingDraft,
    setBusinessOnboardingDraft,
  } = useOnboarding();
  const { user } = useUser();
  const createOrResumeBusinessOnboarding = useMutation(
    api.business.createOrResumeBusinessOnboarding
  );
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const { flow, bref } = useLocalSearchParams<{
    flow?: string;
    bref?: string;
  }>();
  const isAdditionalFlow = isAdditionalBusinessFlow(flow);
  const businessReferralCodeFromParams = useMemo(() => {
    const raw = typeof bref === 'string' ? bref.trim() : '';
    return raw.length > 0 ? raw : '';
  }, [bref]);
  const [businessReferralCode, setBusinessReferralCode] = useState(
    businessReferralCodeFromParams
  );
  const [addressQuery, setAddressQuery] = useState(
    businessOnboardingDraft.formattedAddress
  );
  const [selectedAddress, setSelectedAddress] =
    useState<SelectedBusinessAddress | null>(() =>
      toSelectedAddress(businessOnboardingDraft)
    );
  const [error, setError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'createBusiness', flow }).catch(() => {});
  }, [flow, saveStep]);

  useEffect(() => {
    if (businessReferralCodeFromParams) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const pending = await consumePendingJoin();
      if (cancelled || !pending?.bref) {
        return;
      }
      setBusinessReferralCode(pending.bref);
      await savePendingJoin({ bref: pending.bref });
    })();
    return () => {
      cancelled = true;
    };
  }, [businessReferralCodeFromParams]);

  const businessName = normalizeText(
    businessOnboardingDraft.businessName || businessDraft.name
  );
  const shortDescription = normalizeText(
    businessOnboardingDraft.shortDescription
  );
  const businessPhone = normalizeText(businessOnboardingDraft.businessPhone);
  const serviceTypes = sanitizeServiceTypes(
    businessOnboardingDraft.serviceTypes
  );
  const serviceTags = businessOnboardingDraft.serviceTags
    .map(normalizeText)
    .filter(Boolean);
  const hasRequiredBasics =
    businessName.length > 0 &&
    shortDescription.length > 0 &&
    businessPhone.length > 0 &&
    serviceTypes.length > 0 &&
    serviceTags.length > 0 &&
    Boolean(businessOnboardingDraft.discoverySource) &&
    Boolean(businessOnboardingDraft.reason) &&
    businessOnboardingDraft.usageAreas.length > 0 &&
    Boolean(businessOnboardingDraft.ageRange) &&
    Boolean(businessOnboardingDraft.businessExample) &&
    Boolean(businessOnboardingDraft.cadenceBand) &&
    businessOnboardingDraft.birthdayCampaignRelevant !== null &&
    businessOnboardingDraft.joinAnniversaryCampaignRelevant !== null &&
    businessOnboardingDraft.weakTimePromosRelevant !== null;
  const canSubmit =
    hasRequiredBasics &&
    isValidSelectedBusinessAddress(selectedAddress) &&
    !isSubmitting;

  const handleSelectedAddressChange = (value: SelectedBusinessAddress | null) => {
    setSelectedAddress(value);
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      formattedAddress: value?.formattedAddress ?? '',
      placeId: value?.placeId ?? '',
      locationLat: value?.latitude ?? null,
      locationLng: value?.longitude ?? null,
      city: value?.city ?? '',
      street: value?.street ?? '',
      streetNumber: value?.streetNumber ?? '',
    }));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!hasRequiredBasics) {
      setError(TEXT.missingBasics);
      return;
    }
    if (!selectedAddress || !isValidSelectedBusinessAddress(selectedAddress)) {
      setError(TEXT.addressRequired);
      return;
    }
    const validSelectedAddress = selectedAddress;

    setError(null);
    setIsSubmitting(true);

    const resolvedExternalId =
      businessDraft.externalId.trim() ||
      buildExternalId(businessName, user?._id as string | undefined);

    try {
      setBusinessDraft((prev) => ({
        ...prev,
        name: businessName,
        externalId: resolvedExternalId,
      }));

      const result = await createOrResumeBusinessOnboarding({
        existingBusinessId: businessId ?? undefined,
        name: businessName,
        externalId: resolvedExternalId,
        logoUrl: businessDraft.logoUrl,
        colors: businessDraft.colors,
        businessReferralCode: businessReferralCode || undefined,
        shortDescription,
        businessPhone,
        serviceTypes,
        serviceTags,
        discoverySource: businessOnboardingDraft.discoverySource ?? undefined,
        reason: businessOnboardingDraft.reason ?? undefined,
        usageAreas: businessOnboardingDraft.usageAreas,
        ownerAgeRange: businessOnboardingDraft.ageRange ?? undefined,
        businessExample: businessOnboardingDraft.businessExample ?? undefined,
        cadenceBand: businessOnboardingDraft.cadenceBand ?? undefined,
        birthdayCampaignRelevant:
          businessOnboardingDraft.birthdayCampaignRelevant ?? undefined,
        joinAnniversaryCampaignRelevant:
          businessOnboardingDraft.joinAnniversaryCampaignRelevant ?? undefined,
        weakTimePromosRelevant:
          businessOnboardingDraft.weakTimePromosRelevant ?? undefined,
        formattedAddress: validSelectedAddress.formattedAddress,
        placeId: validSelectedAddress.placeId,
        lat: validSelectedAddress.latitude,
        lng: validSelectedAddress.longitude,
        city: validSelectedAddress.city,
        street: validSelectedAddress.street,
        streetNumber: validSelectedAddress.streetNumber,
      });

      const returnedBusinessId = result.businessId as Id<'businesses'>;
      setBusinessId(returnedBusinessId);
      try {
        await saveStep({
          step: 'createBusiness',
          flow,
          businessId: returnedBusinessId,
        });
      } catch {
        // The returned businessId stays in local state; retry can resume by externalId.
      }
      void trackActivationEvent(ANALYTICS_EVENTS.businessCreated, {
        role: 'business',
        userId: user?._id,
      });
      safePush(
        withBusinessOnboardingFlow(BUSINESS_ONBOARDING_ROUTES.createProgram, flow)
      );
    } catch {
      setError(TEXT.createError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          stickyHeaderIndices={[0]}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <StickyScrollHeader
            topPadding={0}
            backgroundColor="#FBFAF7"
            style={styles.titleContainer}
          >
            <StandaloneBackTitleHeader
              title={TEXT.title}
              subtitle={TEXT.subtitle}
              onBackPress={() =>
                safeDismissTo(
                  withBusinessOnboardingFlow(
                    isAdditionalFlow
                      ? '/(authenticated)/(business)/settings'
                      : BUSINESS_ONBOARDING_ROUTES.businessBasics,
                    flow
                  )
                )
              }
              leftAccessory={
                <OnboardingProgress
                  total={getBusinessOnboardingTotalSteps(flow)}
                  current={getBusinessOnboardingProgressStep(
                    'createBusiness',
                    flow
                  )}
                />
              }
              style={styles.header}
              titleStyle={styles.title}
              subtitleStyle={styles.subtitle}
            />
          </StickyScrollHeader>

          <BusinessAddressSelector
            query={addressQuery}
            selectedAddress={selectedAddress}
            onQueryChange={setAddressQuery}
            onSelectedAddressChange={handleSelectedAddressChange}
            label={TEXT.searchLabel}
            errorText={addressError}
            onError={setAddressError}
          />

          {!hasRequiredBasics ? (
            <Text style={styles.errorText}>{TEXT.missingBasics}</Text>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            label={isSubmitting ? TEXT.creating : TEXT.continue}
          />
        </View>
      </KeyboardAvoidingView>
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
  body: {
    marginTop: 12,
    flex: 1,
  },
  bodyContent: {
    gap: 18,
    paddingBottom: 16,
  },
  titleContainer: {
    alignItems: alignItems.start,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    marginTop: 16,
  },
});
