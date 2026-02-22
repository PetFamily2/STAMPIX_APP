import { useMutation } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
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
import { safeBack, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title:
    '\u05d9\u05d5\u05e6\u05e8\u05d9\u05dd \u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e0\u05d0\u05de\u05e0\u05d5\u05ea',
  subtitle:
    '\u05d4\u05d2\u05d3\u05d9\u05e8\u05d5 \u05de\u05d4 \u05d4\u05dc\u05e7\u05d5\u05d7 \u05e6\u05d5\u05d1\u05e8 \u05d5\u05de\u05ea\u05d9 \u05de\u05de\u05de\u05e9\u05d9\u05dd \u05d4\u05d8\u05d1\u05d4.',
  cardNameLabel: '\u05e9\u05dd \u05d4\u05db\u05e8\u05d8\u05d9\u05e1',
  cardNamePlaceholder:
    '\u05dc\u05de\u05e9\u05dc: \u05db\u05e8\u05d8\u05d9\u05e1 \u05e7\u05e4\u05d4 \u05e7\u05d1\u05d5\u05e2',
  rewardLabel: '\u05e9\u05dd \u05d4\u05d4\u05d8\u05d1\u05d4',
  rewardPlaceholder:
    '\u05dc\u05de\u05e9\u05dc: \u05e7\u05e4\u05d4 \u05d7\u05d9\u05e0\u05dd',
  maxStampsLabel:
    '\u05db\u05de\u05d5\u05ea \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd',
  maxStampsPlaceholder: '10',
  stampIconLabel:
    '\u05d0\u05d9\u05d9\u05e7\u05d5\u05df \u05e0\u05d9\u05e7\u05d5\u05d1',
  stampIconPlaceholder: 'star',
  continue: '\u05e9\u05de\u05d9\u05e8\u05d4 \u05d5\u05d4\u05de\u05e9\u05da',
  submitting:
    '\u05e9\u05d5\u05de\u05e8\u05d9\u05dd \u05ea\u05d5\u05db\u05e0\u05d9\u05ea...',
  missingBusiness:
    '\u05e0\u05d3\u05e8\u05e9 \u05e2\u05e1\u05e7 \u05e4\u05e2\u05d9\u05dc \u05e7\u05d5\u05d3\u05dd',
  errorFallback:
    '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05d9\u05e6\u05d9\u05e8\u05ea \u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea',
  helper:
    '\u05d1\u05e9\u05dc\u05d1 \u05d4\u05d1\u05d0 \u05ea\u05e8\u05d0\u05d5 \u05ea\u05e6\u05d5\u05d2\u05d4 \u05de\u05e7\u05d3\u05d9\u05de\u05d4 \u05e9\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1.',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

export default function CreateProgramScreen() {
  const { businessId, programDraft, setProgramDraft, setProgramId } =
    useOnboarding();
  const { user } = useUser();
  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!businessId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
    }
  }, [businessId]);

  const maxStampsNumber = useMemo(
    () => Number(programDraft.maxStamps),
    [programDraft.maxStamps]
  );

  const canSubmit =
    Boolean(
      programDraft.title.trim() &&
        programDraft.rewardName.trim() &&
        programDraft.stampIcon.trim() &&
        maxStampsNumber > 0
    ) && !isSubmitting;

  const handleSubmit = async () => {
    if (!businessId) {
      setError(TEXT.missingBusiness);
      return;
    }
    if (!canSubmit) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { loyaltyProgramId } = await createProgram({
        businessId,
        title: programDraft.title.trim(),
        rewardName: programDraft.rewardName.trim(),
        maxStamps: maxStampsNumber,
        stampIcon: programDraft.stampIcon.trim(),
      });

      setProgramId(loyaltyProgramId);
      void trackActivationEvent(ANALYTICS_EVENTS.loyaltyCardCreated, {
        role: 'business',
        userId: user?._id,
      });

      safePush(BUSINESS_ONBOARDING_ROUTES.previewCard);
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
            onPress={() => safeBack(BUSINESS_ONBOARDING_ROUTES.createBusiness)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.createProgram}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.cardNameLabel}</Text>
            <TextInput
              value={programDraft.title}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, title: text }))
              }
              placeholder={TEXT.cardNamePlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.cardNameLabel}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.rewardLabel}</Text>
            <TextInput
              value={programDraft.rewardName}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, rewardName: text }))
              }
              placeholder={TEXT.rewardPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.rewardLabel}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.maxStampsLabel}</Text>
            <TextInput
              value={programDraft.maxStamps}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, maxStamps: text }))
              }
              keyboardType="number-pad"
              placeholder={TEXT.maxStampsPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.maxStampsLabel}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{TEXT.stampIconLabel}</Text>
            <TextInput
              value={programDraft.stampIcon}
              onChangeText={(text) =>
                setProgramDraft((prev) => ({ ...prev, stampIcon: text }))
              }
              placeholder={TEXT.stampIconPlaceholder}
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              accessibilityLabel={TEXT.stampIconLabel}
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
