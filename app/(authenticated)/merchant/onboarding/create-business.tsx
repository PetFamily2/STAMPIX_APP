import { useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { safeBack, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title:
    '\u05d9\u05d5\u05e6\u05e8\u05d9\u05dd \u05e2\u05e1\u05e7 \u05d7\u05d3\u05e9',
  subtitle:
    '\u05d4\u05d2\u05d3\u05e8\u05d5 \u05d0\u05ea \u05d4\u05e4\u05e8\u05d8\u05d9\u05dd \u05d4\u05d1\u05e1\u05d9\u05e1\u05d9\u05d9\u05dd \u05e9\u05dc \u05d4\u05e2\u05e1\u05e7 \u05db\u05d3\u05d9 \u05dc\u05d4\u05ea\u05d7\u05d9\u05dc.',
  businessNameLabel: '\u05e9\u05dd \u05d4\u05e2\u05e1\u05e7',
  businessNamePlaceholder:
    '\u05dc\u05de\u05e9\u05dc: \u05e7\u05e4\u05d4 \u05d4\u05e4\u05d9\u05e0\u05d4',
  externalIdLabel: '\u05de\u05d6\u05d4\u05d4 \u05e2\u05e1\u05e7 (externalId)',
  externalIdPlaceholder: '\u05dc\u05de\u05e9\u05dc: cafe-hapina',
  applySlug:
    '\u05d4\u05e9\u05ea\u05de\u05e9\u05d5 \u05d1\u05d4\u05e6\u05e2\u05d4',
  slugHintPrefix: '\u05d4\u05e6\u05e2\u05d4:',
  logoUrlLabel:
    '\u05e7\u05d9\u05e9\u05d5\u05e8 \u05dc\u05dc\u05d5\u05d2\u05d5 (\u05d0\u05d5\u05e4\u05e6\u05d9\u05d5\u05e0\u05dc\u05d9)',
  logoUrlPlaceholder:
    '\u05db\u05ea\u05d5\u05d1\u05ea \u05ea\u05de\u05d5\u05e0\u05d4',
  colorsLabel:
    '\u05e6\u05d1\u05e2 \u05e8\u05d0\u05e9\u05d9 (\u05d0\u05d5\u05e4\u05e6\u05d9\u05d5\u05e0\u05dc\u05d9)',
  colorsPlaceholder: '#2563EB',
  continue: '\u05e9\u05de\u05d9\u05e8\u05d4 \u05d5\u05d4\u05de\u05e9\u05da',
  submitting: '\u05e9\u05d5\u05de\u05e8\u05d9\u05dd \u05e2\u05e1\u05e7...',
  errorFallback:
    '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05d9\u05e6\u05d9\u05e8\u05ea \u05d4\u05e2\u05e1\u05e7',
  helper:
    '\u05d4\u05e4\u05e8\u05d8\u05d9\u05dd \u05d9\u05d5\u05db\u05dc\u05d5 \u05dc\u05d4\u05ea\u05e2\u05d3\u05db\u05df \u05d1\u05d4\u05de\u05e9\u05da \u05de\u05de\u05e1\u05da \u05d4\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea.',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default function CreateBusinessScreen() {
  const { businessDraft, setBusinessDraft, setBusinessId } = useOnboarding();
  const { user } = useUser();
  const createBusiness = useMutation(api.business.createBusiness);
  const { businessName } = useLocalSearchParams<{ businessName?: string }>();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof businessName !== 'string') {
      return;
    }
    const normalized = businessName.trim();
    if (!normalized || businessDraft.name.trim().length > 0) {
      return;
    }

    setBusinessDraft((prev) => ({ ...prev, name: normalized }));
  }, [businessDraft.name, businessName, setBusinessDraft]);

  const slugSuggestion = useMemo(() => {
    if (!businessDraft.name) {
      return '';
    }
    return businessDraft.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [businessDraft.name]);

  const canSubmit =
    Boolean(businessDraft.name.trim() && businessDraft.externalId.trim()) &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { businessId } = await createBusiness({
        name: businessDraft.name.trim(),
        externalId: businessDraft.externalId.trim(),
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
            onPress={() => safeBack(BUSINESS_ONBOARDING_ROUTES.usageArea)}
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

        <View style={styles.formCard}>
          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.businessNameLabel}</Text>
            <TextInput
              value={businessDraft.name}
              onChangeText={(text) =>
                setBusinessDraft((prev) => ({ ...prev, name: text }))
              }
              placeholder={TEXT.businessNamePlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.businessNameLabel}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <View style={styles.rowBetween}>
              {slugSuggestion ? (
                <Pressable
                  onPress={() =>
                    setBusinessDraft((prev) => ({
                      ...prev,
                      externalId: slugSuggestion,
                    }))
                  }
                  disabled={isSubmitting}
                >
                  <Text style={styles.slugAction}>{TEXT.applySlug}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Text style={styles.label}>{TEXT.externalIdLabel}</Text>
            </View>

            <TextInput
              value={businessDraft.externalId}
              onChangeText={(text) =>
                setBusinessDraft((prev) => ({ ...prev, externalId: text }))
              }
              placeholder={TEXT.externalIdPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.externalIdLabel}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {slugSuggestion ? (
              <Text
                style={styles.hintText}
              >{`${TEXT.slugHintPrefix} ${slugSuggestion}`}</Text>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.logoUrlLabel}</Text>
            <TextInput
              value={businessDraft.logoUrl ?? ''}
              onChangeText={(text) =>
                setBusinessDraft((prev) => ({
                  ...prev,
                  logoUrl: text.trim().length > 0 ? text : undefined,
                }))
              }
              placeholder={TEXT.logoUrlPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.logoUrlLabel}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.colorsLabel}</Text>
            <TextInput
              value={businessDraft.colors ?? ''}
              onChangeText={(text) =>
                setBusinessDraft((prev) => ({
                  ...prev,
                  colors: text.trim().length > 0 ? text : undefined,
                }))
              }
              placeholder={TEXT.colorsPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.colorsLabel}
              autoCapitalize="none"
              autoCorrect={false}
            />
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
          <Text style={styles.helperText}>{TEXT.helper}</Text>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
    lineHeight: 20,
  },
  formCard: {
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 14,
    shadowColor: '#9CA3AF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  field: {
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
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
    textAlign: 'right',
  },
  slugAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'left',
  },
  hintText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'right',
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
    gap: 10,
  },
  helperText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
    lineHeight: 16,
  },
});
