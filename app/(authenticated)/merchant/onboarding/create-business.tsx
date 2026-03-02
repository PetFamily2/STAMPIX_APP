import { useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { trackActivationEvent } from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title: 'מה הכתובות של העסק?',
  subtitle: 'כדי שנוכל להציג את העסק נכון במפה',
  cityLabel: 'עיר/יישוב',
  cityPlaceholder: 'תל אביב',
  streetLabel: 'רחוב',
  streetPlaceholder: 'הרצל',
  numberLabel: 'מספר',
  numberPlaceholder: '12',
  continue: 'המשך',
  submitting: 'שומרים עסק',
  errorFallback: 'שגיאה ביצירת העסק',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
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
  const createBusiness = useMutation(api.business.createBusiness);
  const { businessName } = useLocalSearchParams<{ businessName?: string }>();
  const streetInputRef = useRef<TextInput>(null);
  const streetNumberInputRef = useRef<TextInput>(null);

  const city = businessOnboardingDraft.city;
  const street = businessOnboardingDraft.street;
  const streetNumber = businessOnboardingDraft.streetNumber;
  const resolvedBusinessNameFromFlow = businessOnboardingDraft.businessName;
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fromDraft = resolvedBusinessNameFromFlow.trim();
    const fromParams =
      typeof businessName === 'string' ? businessName.trim() : '';
    const normalized = fromDraft || fromParams;
    if (!normalized || businessDraft.name.trim().length > 0) {
      return;
    }

    setBusinessDraft((prev) => ({ ...prev, name: normalized }));
    if (!fromDraft) {
      setBusinessOnboardingDraft((prev) => ({
        ...prev,
        businessName: normalized,
      }));
    }
  }, [
    businessDraft.name,
    businessName,
    resolvedBusinessNameFromFlow,
    setBusinessOnboardingDraft,
    setBusinessDraft,
  ]);

  const normalizedBusinessName = useMemo(
    () => businessDraft.name.trim(),
    [businessDraft.name]
  );

  const generatedExternalId = useMemo(() => {
    if (!normalizedBusinessName) {
      return '';
    }

    const slug = normalizedBusinessName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (slug.length > 0) {
      return slug;
    }

    // Fallback for names that don't contain latin letters/digits (e.g. Hebrew).
    return `business-${Date.now().toString(36)}`;
  }, [normalizedBusinessName]);

  const resolvedExternalId = useMemo(() => {
    const existing = businessDraft.externalId.trim();
    if (existing) {
      return existing;
    }
    return generatedExternalId;
  }, [businessDraft.externalId, generatedExternalId]);

  const hasAddress =
    city.trim().length > 0 &&
    street.trim().length > 0 &&
    streetNumber.trim().length > 0;

  const canSubmit =
    Boolean(normalizedBusinessName && resolvedExternalId && hasAddress) &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (businessId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
      return;
    }

    if (!canSubmit) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (!businessDraft.externalId.trim()) {
        setBusinessDraft((prev) => ({
          ...prev,
          externalId: resolvedExternalId,
        }));
      }

      const { businessId } = await createBusiness({
        name: normalizedBusinessName,
        externalId: resolvedExternalId,
        logoUrl: businessDraft.logoUrl,
        colors: businessDraft.colors,
      });

      setBusinessId(businessId);
      void trackActivationEvent(ANALYTICS_EVENTS.businessCreated, {
        role: 'business',
        userId: user?._id,
      });

      safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
    } catch (submitError: unknown) {
      setError(toErrorMessage(submitError, TEXT.errorFallback));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.usageArea)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.createBusiness}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.cityLabel}</Text>
            <TextInput
              value={city}
              onChangeText={(value) =>
                setBusinessOnboardingDraft((prev) => ({
                  ...prev,
                  city: value,
                }))
              }
              placeholder={TEXT.cityPlaceholder}
              placeholderTextColor="#9EA7B8"
              style={styles.input}
              accessibilityLabel={TEXT.cityLabel}
              returnKeyType="next"
              submitBehavior="submit"
              blurOnSubmit={false}
              onSubmitEditing={() => streetInputRef.current?.focus()}
              textAlign="right"
            />
          </View>

          <View style={styles.addressRow}>
            <View style={[styles.field, styles.streetField]}>
              <Text style={styles.label}>{TEXT.streetLabel}</Text>
              <TextInput
                ref={streetInputRef}
                value={street}
                onChangeText={(value) =>
                  setBusinessOnboardingDraft((prev) => ({
                    ...prev,
                    street: value,
                  }))
                }
                placeholder={TEXT.streetPlaceholder}
                placeholderTextColor="#9EA7B8"
                style={styles.input}
                accessibilityLabel={TEXT.streetLabel}
                returnKeyType="next"
                submitBehavior="submit"
                blurOnSubmit={false}
                onSubmitEditing={() => streetNumberInputRef.current?.focus()}
                textAlign="right"
              />
            </View>

            <View style={[styles.field, styles.numberField]}>
              <Text style={styles.label}>{TEXT.numberLabel}</Text>
              <TextInput
                ref={streetNumberInputRef}
                value={streetNumber}
                onChangeText={(value) =>
                  setBusinessOnboardingDraft((prev) => ({
                    ...prev,
                    streetNumber: value,
                  }))
                }
                placeholder={TEXT.numberPlaceholder}
                placeholderTextColor="#9EA7B8"
                style={styles.input}
                accessibilityLabel={TEXT.numberLabel}
                keyboardType="number-pad"
                returnKeyType="done"
                textAlign="center"
              />
            </View>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {isSubmitting ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.submittingText}>{TEXT.submitting}</Text>
          </View>
        ) : null}

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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  form: {
    marginTop: 24,
    gap: 12,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    writingDirection: 'rtl',
  },
  addressRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  streetField: {
    flex: 1,
  },
  numberField: {
    width: 92,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  submittingRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  submittingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'right',
  },
  footer: {
    marginTop: 'auto',
  },
});
