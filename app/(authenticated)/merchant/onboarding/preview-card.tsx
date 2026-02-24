import { useMutation } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { useAppMode } from '@/contexts/AppModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title:
    '\u05ea\u05e6\u05d5\u05d2\u05d4 \u05de\u05e7\u05d3\u05d9\u05de\u05d4 \u05dc\u05db\u05e8\u05d8\u05d9\u05e1',
  subtitle:
    '\u05db\u05db\u05d4 \u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05e9\u05dc\u05db\u05dd \u05d9\u05e8\u05d0\u05d4 \u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea.',
  rewardLabel: '\u05d4\u05d8\u05d1\u05d4',
  stampsLabel:
    '\u05de\u05e1\u05e4\u05e8 \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd',
  continue:
    '\u05e1\u05d9\u05d5\u05dd \u05d5\u05e4\u05ea\u05d9\u05d7\u05ea \u05e1\u05d5\u05e8\u05e7',
  submitting:
    '\u05de\u05e9\u05dc\u05d9\u05de\u05d9\u05dd \u05d4\u05d2\u05d3\u05e8\u05d5\u05ea...',
  fallbackBusinessName: '\u05e2\u05e1\u05e7 \u05d7\u05d3\u05e9',
  fallbackReward:
    '\u05de\u05d2\u05e9 \u05e4\u05d9\u05e6\u05d4 \u05d7\u05d9\u05e0\u05dd',
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
  errorMessage:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d4\u05e9\u05dc\u05d9\u05dd \u05d0\u05ea \u05d4\u05d0\u05d5\u05e0\u05d1\u05d5\u05e8\u05d3\u05d9\u05e0\u05d2 \u05d4\u05e2\u05e1\u05e7\u05d9. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
};

const PREVIEW_FILLED_STAMPS = 3;
const MAX_STAMPS_PER_ROW = 5;

export default function PreviewCardScreen() {
  const { businessDraft, programDraft, businessId, programId, reset } =
    useOnboarding();
  const completeBusinessOnboarding = useMutation(
    api.users.completeBusinessOnboarding
  );
  const setActiveMode = useMutation(api.users.setActiveMode);
  const { setAppMode } = useAppMode();

  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (!businessId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
      return;
    }

    if (!programId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
    }
  }, [businessId, programId]);

  const stampCount = useMemo(() => {
    const parsed = Number(programDraft.maxStamps);
    return parsed > 0 ? parsed : 1;
  }, [programDraft.maxStamps]);

  const stampLabel = useMemo(() => {
    const value = programDraft.stampIcon?.trim();
    if (value && value.length > 0) {
      return value.charAt(0).toUpperCase();
    }
    return '*';
  }, [programDraft.stampIcon]);

  const stampSlots = useMemo(
    () => Array.from({ length: stampCount }, (_, index) => index + 1),
    [stampCount]
  );
  const stampRows = useMemo(() => {
    if (stampSlots.length <= MAX_STAMPS_PER_ROW) {
      return [stampSlots];
    }

    if (stampSlots.length <= MAX_STAMPS_PER_ROW * 2) {
      const firstRowCount = Math.ceil(stampSlots.length / 2);
      return [
        stampSlots.slice(0, firstRowCount),
        stampSlots.slice(firstRowCount),
      ];
    }

    const rows: number[][] = [];
    for (
      let index = 0;
      index < stampSlots.length;
      index += MAX_STAMPS_PER_ROW
    ) {
      rows.push(stampSlots.slice(index, index + MAX_STAMPS_PER_ROW));
    }
    return rows;
  }, [stampSlots]);
  const rewardValue = programDraft.rewardName.trim();
  const isFallbackReward = rewardValue.length === 0;

  const handleFinish = async () => {
    if (!businessId || !programId || isFinishing) {
      return;
    }

    setIsFinishing(true);
    try {
      await completeBusinessOnboarding({});
      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      reset();
      safePush('/(authenticated)/(business)/scanner');
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.errorMessage);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.createProgram)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.previewCard}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewBusinessName}>
            {businessDraft.name.trim() || TEXT.fallbackBusinessName}
          </Text>
          <Text
            style={[
              styles.previewReward,
              isFallbackReward && styles.previewRewardFallback,
            ]}
          >{`${TEXT.rewardLabel}: ${rewardValue || TEXT.fallbackReward}`}</Text>

          <View style={styles.stampsGroup}>
            {stampRows.map((row, rowIndex) => (
              <View key={`stamps-row-${rowIndex + 1}`} style={styles.stampsRow}>
                {row.map((slot) => {
                  const filled =
                    slot <= Math.min(PREVIEW_FILLED_STAMPS, stampCount);
                  return (
                    <View
                      key={`stamp-${slot}`}
                      style={[
                        styles.stamp,
                        filled ? styles.stampFilled : styles.stampEmpty,
                      ]}
                    >
                      <Text
                        style={
                          filled
                            ? styles.stampTextFilled
                            : styles.stampTextEmpty
                        }
                      >
                        {stampLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{TEXT.stampsLabel}</Text>
            <Text style={styles.summaryValue}>{stampCount}</Text>
          </View>
        </View>

        {isFinishing ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.submittingText}>{TEXT.submitting}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleFinish();
            }}
            disabled={!businessId || !programId || isFinishing}
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 20,
  },
  previewCard: {
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#9CA3AF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  previewBusinessName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  previewReward: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'right',
  },
  previewRewardFallback: {
    color: '#9CA3AF',
  },
  stampsGroup: {
    marginTop: 16,
    gap: 8,
  },
  stampsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-end',
    gap: 8,
  },
  stamp: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampFilled: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  stampEmpty: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  stampTextFilled: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stampTextEmpty: {
    fontSize: 15,
    fontWeight: '900',
    color: '#6B7280',
  },
  summaryRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'left',
  },
  submittingRow: {
    marginTop: 12,
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
