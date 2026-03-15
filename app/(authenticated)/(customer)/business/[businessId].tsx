import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack } from '@/lib/navigation';

const TEXT = {
  loading: 'טוען פרטי עסק',
  missingBusiness: 'חסרים פרטי עסק',
  back: 'חזרה',
  joinHintTitle: 'בחירת כרטיסיות להצטרפות',
  joinHintSubtitle:
    'בחרו את הכרטיסיות שרלוונטיות לכם. אפשר לחזור לכאן ולהצטרף לעוד כרטיסיות בכל זמן.',
  joinedSection: 'הכרטיסיות שלי',
  availableSection: 'כרטיסיות זמינות להצטרפות',
  noJoined: 'עדיין לא הצטרפתם לכרטיסיות של העסק',
  noAvailable: 'אין כרגע כרטיסיות נוספות להצטרפות',
  joinButton: 'הצטרפות לכרטיסיות שנבחרו',
  joining: 'מצרף...',
  chooseAtLeastOne: 'יש לבחור לפחות כרטיסיה אחת',
  joinSuccess: 'ההצטרפות בוצעה בהצלחה',
  joinFailed: 'לא הצלחנו להשלים את ההצטרפות. נסו שוב.',
  goalPrefix: 'יעד',
  stamps: 'ניקובים',
  redeemReady: 'מוכנה למימוש',
  openCard: 'פתח כרטיסיה',
};

type ProgramRow = {
  programId: string;
  title: string;
  rewardName: string;
  maxStamps: number;
  stampIcon: string;
  cardThemeId: string | null;
  membershipId: string | null;
  currentStamps: number;
  canRedeem: boolean;
};

type CustomerBusinessQuery = {
  business: {
    businessId: string;
    name: string;
    logoUrl: string | null;
    formattedAddress: string | null;
  };
  joinedPrograms: ProgramRow[];
  availablePrograms: ProgramRow[];
};

function extractParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function formatProgress(currentStamps: number, maxStamps: number) {
  const max = Math.max(1, Number(maxStamps || 0));
  const current = Math.max(0, Math.min(max, Number(currentStamps || 0)));
  return `${current}/${max}`;
}

export default function CustomerBusinessDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    businessId?: string;
    join?: string;
    src?: string;
    camp?: string;
  }>();
  const businessIdParam = extractParam(params.businessId);
  const joinMode = extractParam(params.join) === 'true';
  const joinSource = extractParam(params.src) || undefined;
  const joinCampaign = extractParam(params.camp) || undefined;

  const businessQuery = useQuery(
    api.memberships.getCustomerBusiness,
    businessIdParam
      ? { businessId: businessIdParam as Id<'businesses'> }
      : 'skip'
  ) as CustomerBusinessQuery | undefined;
  const joinSelectedPrograms = useMutation(
    api.memberships.joinSelectedPrograms
  );

  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const selectedCount = selectedProgramIds.length;
  const hasBusinessId = businessIdParam.length > 0;
  const isLoading = hasBusinessId && businessQuery === undefined;
  const joinedPrograms = businessQuery?.joinedPrograms ?? [];
  const availablePrograms = businessQuery?.availablePrograms ?? [];

  const selectedSet = useMemo(
    () => new Set(selectedProgramIds.map((programId) => String(programId))),
    [selectedProgramIds]
  );

  const toggleProgramSelection = (programId: string) => {
    setFeedback(null);
    setSelectedProgramIds((current) => {
      const key = String(programId);
      if (current.includes(key)) {
        return current.filter((id) => id !== key);
      }
      return [...current, key];
    });
  };

  const handleJoinSelected = async () => {
    if (!hasBusinessId || selectedCount === 0 || isJoining) {
      if (selectedCount === 0) {
        setFeedback({ type: 'error', message: TEXT.chooseAtLeastOne });
      }
      return;
    }

    setIsJoining(true);
    setFeedback(null);
    try {
      const result = await joinSelectedPrograms({
        businessId: businessIdParam as Id<'businesses'>,
        programIds: selectedProgramIds as Id<'loyaltyPrograms'>[],
        source: joinSource,
        campaign: joinCampaign,
      });
      setSelectedProgramIds([]);
      setFeedback({ type: 'success', message: TEXT.joinSuccess });
      track(ANALYTICS_EVENTS.joinCompleted, {
        businessId: businessIdParam,
        selected_program_count: selectedCount,
        joined_program_count: result.joinedCount,
        src: joinSource,
        camp: joinCampaign,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : TEXT.joinFailed,
      });
    } finally {
      setIsJoining(false);
    }
  };

  if (!hasBusinessId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageText}>{TEXT.missingBusiness}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <ActivityIndicator color="#2F6BFF" />
          <Text style={styles.centerMessageText}>{TEXT.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!businessQuery) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageText}>{TEXT.joinFailed}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const business = businessQuery.business;
  const canSubmitSelection = selectedCount > 0 && !isJoining;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader
            title={business.name}
            subtitle={business.formattedAddress ?? ''}
            titleAccessory={
              <Pressable
                onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={TEXT.back}
              >
                <Ionicons name="chevron-forward" size={20} color="#111827" />
              </Pressable>
            }
          />
        </View>

        {joinMode ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{TEXT.joinHintTitle}</Text>
            <Text style={styles.infoSubtitle}>{TEXT.joinHintSubtitle}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{TEXT.availableSection}</Text>

          {availablePrograms.length === 0 ? (
            <Text style={styles.sectionEmpty}>{TEXT.noAvailable}</Text>
          ) : (
            <View style={styles.programList}>
              {availablePrograms.map((program) => {
                const key = String(program.programId);
                const selected = selectedSet.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleProgramSelection(key)}
                    style={({ pressed }) => [
                      styles.programCard,
                      selected ? styles.programCardSelected : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <ProgramCustomerCardPreview
                      businessName={business.name}
                      businessLogoUrl={business.logoUrl}
                      title={program.title}
                      rewardName={program.rewardName}
                      maxStamps={program.maxStamps}
                      previewCurrentStamps={0}
                      cardThemeId={program.cardThemeId}
                      stampIcon={program.stampIcon}
                      selected={selected}
                      variant="list"
                    />
                    <View style={styles.programFooterRow}>
                      <Text style={styles.programGoal}>
                        {TEXT.goalPrefix} {program.maxStamps} {TEXT.stamps}
                      </Text>
                      <View style={styles.programCheckbox}>
                        <Ionicons
                          name={
                            selected ? 'checkmark-circle' : 'ellipse-outline'
                          }
                          size={22}
                          color={selected ? '#2F6BFF' : '#9AA4B8'}
                        />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={handleJoinSelected}
            disabled={!canSubmitSelection}
            style={({ pressed }) => [
              styles.joinButton,
              !canSubmitSelection ? styles.joinButtonDisabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.joinButtonText}>
              {isJoining ? TEXT.joining : TEXT.joinButton}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{TEXT.joinedSection}</Text>
          {joinedPrograms.length === 0 ? (
            <Text style={styles.sectionEmpty}>{TEXT.noJoined}</Text>
          ) : (
            <View style={styles.programList}>
              {joinedPrograms.map((program) => (
                <Pressable
                  key={String(program.programId)}
                  style={({ pressed }) => [
                    styles.programCard,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => {
                    if (program.membershipId) {
                      router.push(`/card/${program.membershipId}`);
                    }
                  }}
                >
                  <ProgramCustomerCardPreview
                    businessName={business.name}
                    businessLogoUrl={business.logoUrl}
                    title={program.title}
                    rewardName={program.rewardName}
                    maxStamps={program.maxStamps}
                    previewCurrentStamps={program.currentStamps}
                    cardThemeId={program.cardThemeId}
                    stampIcon={program.stampIcon}
                    status={program.canRedeem ? 'redeemable' : 'default'}
                    variant="list"
                  />
                  <View style={styles.programFooterRow}>
                    <View style={styles.joinedDetails}>
                      {program.canRedeem ? (
                        <View style={styles.redeemBadge}>
                          <Text style={styles.redeemBadgeText}>
                            {TEXT.redeemReady}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.openCardText}>{TEXT.openCard}</Text>
                    </View>
                    <Text style={styles.programProgress}>
                      {formatProgress(program.currentStamps, program.maxStamps)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {feedback ? (
          <View
            style={[
              styles.feedbackCard,
              feedback.type === 'error'
                ? styles.feedbackError
                : styles.feedbackSuccess,
            ]}
          >
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 14,
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 2,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    padding: 14,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  infoSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'right',
  },
  sectionEmpty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
    lineHeight: 20,
  },
  programList: {
    gap: 8,
  },
  programCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 8,
    gap: 8,
  },
  programCardSelected: {
    backgroundColor: '#EEF4FF',
    borderColor: '#9CC0FF',
  },
  programFooterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  programCheckbox: {
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programGoal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  joinButton: {
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: {
    backgroundColor: '#B5C7F5',
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  joinedDetails: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 4,
  },
  programProgress: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  openCardText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
  },
  redeemBadge: {
    borderRadius: 999,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#9EDDB9',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  redeemBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0D7A3E',
  },
  feedbackCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackError: {
    borderColor: '#F4B4AE',
    backgroundColor: '#FFF5F4',
  },
  feedbackSuccess: {
    borderColor: '#9EDDB9',
    backgroundColor: '#F2FCF6',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    color: '#1A2B4A',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  centerMessageText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
});
