import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
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
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { normalizeStampShape } from '@/constants/stampOptions';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

type CustomerState =
  | 'NEW'
  | 'ACTIVE'
  | 'NEEDS_NURTURE'
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD';
type CustomerValueTier = 'REGULAR' | 'LOYAL' | 'VIP';

type TimelineItemType =
  | 'JOINED_PROGRAM'
  | 'STAMP_ADDED'
  | 'REWARD_REDEEMED'
  | 'STAMP_REVERTED'
  | 'REWARD_REDEEM_REVERTED';

type ReasonCode =
  | 'mistake'
  | 'wrong_program'
  | 'wrong_customer'
  | 'duplicate'
  | 'customer_service'
  | 'other';

const REASON_OPTIONS: Array<{ code: ReasonCode; label: string }> = [
  { code: 'mistake', label: 'טעות אנוש' },
  { code: 'wrong_program', label: 'תוכנית שגויה' },
  { code: 'wrong_customer', label: 'לקוח שגוי' },
  { code: 'duplicate', label: 'פעולה כפולה' },
  { code: 'customer_service', label: 'שירות לקוחות' },
  { code: 'other', label: 'אחר' },
];

const LEGACY_STATUS_TO_STATE: Record<string, string> = {
  NEW_CUSTOMER: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_WINBACK: 'צריך וינבאק',
  CLOSE_TO_REWARD: 'קרוב להטבה',
  VIP: 'VIP',
};

const STATUS_COLORS: Record<string, string> = {
  NEW_CUSTOMER: '#0EA5E9',
  ACTIVE: '#334155',
  NEEDS_WINBACK: '#DC2626',
  CLOSE_TO_REWARD: '#D97706',
  VIP: '#4338CA',
};
void LEGACY_STATUS_TO_STATE;
void STATUS_COLORS;

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'צריך חיזוק',
  NEEDS_WINBACK: 'צריך וינבאק',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

const STATE_TEXT_COLORS: Record<CustomerState, string> = {
  NEW: '#0EA5E9',
  ACTIVE: '#334155',
  NEEDS_NURTURE: '#C2410C',
  NEEDS_WINBACK: '#DC2626',
  CLOSE_TO_REWARD: '#D97706',
};

const VALUE_TIER_LABELS: Record<CustomerValueTier, string> = {
  REGULAR: 'רגיל',
  LOYAL: 'נאמן',
  VIP: 'VIP',
};

const VALUE_TIER_COLORS: Record<CustomerValueTier, string> = {
  REGULAR: '#64748B',
  LOYAL: '#047857',
  VIP: '#4338CA',
};

function resolveSummaryState(summary: { customerState?: string | null }) {
  const state = summary.customerState;
  if (
    state === 'NEW' ||
    state === 'ACTIVE' ||
    state === 'NEEDS_NURTURE' ||
    state === 'NEEDS_WINBACK' ||
    state === 'CLOSE_TO_REWARD'
  ) {
    return state;
  }
  return 'ACTIVE';
}

function resolveSummaryTier(summary: { customerValueTier?: string | null }) {
  const tier = summary.customerValueTier;
  if (tier === 'REGULAR' || tier === 'LOYAL' || tier === 'VIP') {
    return tier;
  }
  return 'REGULAR';
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatLastVisit(daysAgo: number) {
  if (daysAgo <= 0) {
    return 'היום';
  }
  if (daysAgo === 1) {
    return 'אתמול';
  }
  return `לפני ${daysAgo} ימים`;
}

function getTimelineIcon(type: TimelineItemType) {
  if (type === 'STAMP_ADDED') {
    return 'add-circle-outline';
  }
  if (type === 'REWARD_REDEEMED') {
    return 'gift-outline';
  }
  if (type === 'STAMP_REVERTED' || type === 'REWARD_REDEEM_REVERTED') {
    return 'refresh-circle-outline';
  }
  return 'enter-outline';
}

function getReasonLabel(reasonCode: string | null) {
  if (!reasonCode) {
    return null;
  }
  const option = REASON_OPTIONS.find((item) => item.code === reasonCode);
  return option?.label ?? null;
}

export default function BusinessCustomerCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const { preview, map, customerUserId } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    customerUserId?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const isStaffRoute = (segments as string[]).includes('(staff)');
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId } = useActiveBusiness();
  const reverseCustomerCardEvent = useMutation(
    api.customerCards.reverseCustomerCardEvent
  );

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventDetail, setSelectedEventDetail] = useState('');
  const [reasonCode, setReasonCode] = useState<ReasonCode>('mistake');
  const [reasonNote, setReasonNote] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const card = useQuery(
    api.customerCards.getBusinessCustomerCard,
    activeBusinessId && customerUserId
      ? {
          businessId: activeBusinessId,
          customerUserId: customerUserId as Id<'users'>,
          limit: 120,
        }
      : 'skip'
  );

  const goBack = () => {
    if (isStaffRoute) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/(authenticated)/(business)/customers',
      params: { tab: 'customers' },
    });
  };

  const closeAdjustmentDialog = () => {
    setSelectedEventId(null);
    setSelectedEventDetail('');
    setReasonCode('mistake');
    setReasonNote('');
    setDialogError(null);
    setIsSubmitting(false);
  };

  const openAdjustmentDialog = (eventId: string, detail: string) => {
    setSelectedEventId(eventId);
    setSelectedEventDetail(detail);
    setReasonCode('mistake');
    setReasonNote('');
    setDialogError(null);
    setFeedbackMessage(null);
  };

  const submitManualAdjustment = async () => {
    if (!selectedEventId) {
      return;
    }
    const normalizedNote = reasonNote.trim();
    if (reasonCode === 'other' && !normalizedNote) {
      setDialogError('יש למלא סיבה כאשר בוחרים "אחר".');
      return;
    }

    setIsSubmitting(true);
    setDialogError(null);
    try {
      await reverseCustomerCardEvent({
        eventId: selectedEventId as Id<'events'>,
        reasonCode,
        reasonNote: normalizedNote.length > 0 ? normalizedNote : undefined,
      });
      closeAdjustmentDialog();
      setFeedbackMessage('התיקון נשמר בהצלחה.');
    } catch {
      setDialogError('לא ניתן להשלים את התיקון עבור פעולה זו.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const summaryState = card ? resolveSummaryState(card.summary) : 'ACTIVE';
  const summaryTier = card ? resolveSummaryTier(card.summary) : 'REGULAR';

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: (insets.bottom || 0) + 28 },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#EEF4FF"
        >
          <BusinessScreenHeader
            title="כרטיס לקוח"
            subtitle={card?.customer.name ?? 'פרטי לקוח והיסטוריית פעילות'}
            titleAccessory={<BackButton onPress={goBack} />}
          />
        </StickyScrollHeader>

        {card === undefined ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#2F6BFF" />
            <Text style={styles.stateText}>טוען כרטיס לקוח...</Text>
          </View>
        ) : card === null ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateTitle}>לא נמצא כרטיס לקוח</Text>
            <Text style={styles.stateText}>
              ייתכן שהלקוח כבר לא פעיל בכרטיסיות של העסק.
            </Text>
            <BackButton onPress={goBack} />
          </View>
        ) : (
          <>
            {feedbackMessage ? (
              <View style={styles.feedbackCard}>
                <Text style={styles.feedbackText}>{feedbackMessage}</Text>
              </View>
            ) : null}

            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIcon}>
                  <Ionicons name="person-outline" size={18} color="#2F6BFF" />
                </View>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.customerName}>{card.customer.name}</Text>
                  <Text style={styles.customerContact}>
                    {card.customer.phone ??
                      card.customer.email ??
                      'ללא פרטי קשר'}
                  </Text>
                </View>
              </View>

              <View style={styles.chipsRow}>
                <View
                  style={[
                    styles.statusChip,
                    {
                      borderColor: STATE_TEXT_COLORS[summaryState],
                      backgroundColor: '#FFFFFF',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: STATE_TEXT_COLORS[summaryState] },
                    ]}
                  >
                    {STATE_LABELS[summaryState]}
                  </Text>
                </View>
                <View style={styles.infoChip}>
                  <Text
                    style={[
                      styles.infoChipText,
                      { color: VALUE_TIER_COLORS[summaryTier] },
                    ]}
                  >
                    {VALUE_TIER_LABELS[summaryTier]}
                  </Text>
                </View>
                <View style={styles.infoChip}>
                  <Text style={styles.infoChipText}>
                    {card.customer.marketingOptIn
                      ? 'מאשר דיוור'
                      : 'לא מאשר דיוור'}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroMetaText}>
                לקוח מאז {formatShortDate(card.summary.joinedAt)}
              </Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ביקור אחרון</Text>
                <Text style={styles.statValue}>
                  {formatLastVisit(card.summary.lastVisitDaysAgo)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ניקובים</Text>
                <Text style={styles.statValue}>
                  {card.summary.totalStampsAdded}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>כרטיסיות פעילות</Text>
                <Text style={styles.statValue}>
                  {card.summary.activeProgramsCount}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>מוכנות למימוש</Text>
                <Text style={styles.statValue}>
                  {card.summary.redeemableProgramsCount}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>כרטיסיות לקוח בעסק</Text>
              <View style={styles.programsList}>
                {card.programs.map((program) => (
                  <View
                    key={String(program.membershipId)}
                    style={styles.programWrap}
                  >
                    <ProgramCustomerCardPreview
                      businessName={card.customer.name}
                      rewardName={program.rewardName}
                      maxStamps={program.maxStamps}
                      previewCurrentStamps={program.currentStamps}
                      title={program.programTitle}
                      stampIcon={program.stampIcon}
                      stampShape={normalizeStampShape(program.stampShape)}
                      cardThemeId={program.cardThemeId}
                      variant="compact"
                      status={program.canRedeem ? 'redeemable' : 'default'}
                      showAllStamps={false}
                    />
                    <Text style={styles.programMetaText}>
                      {program.currentStamps}/{program.maxStamps} • עדכון אחרון:{' '}
                      {formatDateTime(program.lastActivityAt)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>היסטוריית פעילות</Text>
              <View style={styles.timelineList}>
                {card.timeline.length === 0 ? (
                  <Text style={styles.emptyTimelineText}>
                    עדיין אין פעילות ללקוח הזה.
                  </Text>
                ) : (
                  card.timeline.map((item) => {
                    const reasonLabel = getReasonLabel(item.reasonCode);
                    const subtitleParts = [
                      item.programTitle ?? 'ללא תוכנית',
                      item.actorName ? `על ידי ${item.actorName}` : null,
                      reasonLabel ? `סיבה: ${reasonLabel}` : null,
                    ].filter(Boolean);

                    return (
                      <View key={item.id} style={styles.timelineItem}>
                        <View style={styles.timelineIconWrap}>
                          <Ionicons
                            name={getTimelineIcon(item.type)}
                            size={16}
                            color="#2F6BFF"
                          />
                        </View>
                        <View style={styles.timelineTextWrap}>
                          <View style={styles.timelineTitleRow}>
                            <Text style={styles.timelineTitle}>
                              {item.detail}
                            </Text>
                            {item.isReversed ? (
                              <View style={styles.reversedBadge}>
                                <Text style={styles.reversedBadgeText}>
                                  בוטל
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.timelineSubtitle}>
                            {subtitleParts.join(' • ')}
                          </Text>
                          {item.isReversible ? (
                            <Pressable
                              onPress={() =>
                                openAdjustmentDialog(item.id, item.detail)
                              }
                              style={({ pressed }) => [
                                styles.adjustmentButton,
                                pressed ? styles.adjustmentButtonPressed : null,
                              ]}
                            >
                              <Text style={styles.adjustmentButtonText}>
                                בצע תיקון
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <Text style={styles.timelineDate}>
                          {formatDateTime(item.createdAt)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={selectedEventId !== null}
        onRequestClose={closeAdjustmentDialog}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ביצוע תיקון ידני</Text>
            <Text style={styles.modalSubtitle}>
              פעולה זו תירשם בהיסטוריה ותופיע ללקוח.
            </Text>
            <Text style={styles.modalEventText}>{selectedEventDetail}</Text>

            <View style={styles.reasonList}>
              {REASON_OPTIONS.map((option) => {
                const selected = reasonCode === option.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => setReasonCode(option.code)}
                    style={({ pressed }) => [
                      styles.reasonOption,
                      selected ? styles.reasonOptionSelected : null,
                      pressed ? styles.reasonOptionPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.reasonOptionText,
                        selected ? styles.reasonOptionTextSelected : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={reasonNote}
              onChangeText={setReasonNote}
              placeholder='הערה (אופציונלי, חובה אם נבחר "אחר")'
              placeholderTextColor="#94A3B8"
              style={styles.reasonNoteInput}
              textAlign="right"
            />

            {dialogError ? (
              <Text style={styles.dialogError}>{dialogError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={closeAdjustmentDialog}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.modalCancelButton,
                  pressed ? styles.modalPressed : null,
                ]}
              >
                <Text style={styles.modalCancelText}>ביטול</Text>
              </Pressable>
              <Pressable
                onPress={submitManualAdjustment}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.modalConfirmButton,
                  pressed ? styles.modalPressed : null,
                  isSubmitting ? styles.modalDisabled : null,
                ]}
              >
                <Text style={styles.modalConfirmText}>
                  {isSubmitting ? 'שומר...' : 'אישור תיקון'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEF4FF',
  },
  scrollBackground: {
    backgroundColor: '#EEF4FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 14,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7E1F7',
    backgroundColor: '#FFFFFF',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16253D',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'center',
  },
  stateAction: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  stateActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  feedbackCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  feedbackText: {
    color: '#1E3A8A',
    fontWeight: '800',
    textAlign: 'right',
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#CFDBF6',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
  },
  heroTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  customerName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#132849',
    textAlign: 'right',
  },
  customerContact: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoChip: {
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  infoChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730A3',
  },
  heroMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F294B',
    textAlign: 'right',
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#132849',
    textAlign: 'right',
  },
  programsList: {
    gap: 10,
  },
  programWrap: {
    gap: 6,
  },
  programMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  timelineList: {
    gap: 10,
  },
  emptyTimelineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  timelineItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3E9FA',
    backgroundColor: '#FAFCFF',
    padding: 10,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  timelineIconWrap: {
    marginTop: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  timelineTitleRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14253E',
    textAlign: 'right',
  },
  timelineSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  reversedBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reversedBadgeText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '800',
  },
  adjustmentButton: {
    marginTop: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C7DBFF',
    backgroundColor: '#EEF4FF',
    alignSelf: 'flex-end',
  },
  adjustmentButtonPressed: {
    opacity: 0.9,
  },
  adjustmentButtonText: {
    color: '#1E3A8A',
    fontWeight: '800',
    fontSize: 12,
  },
  timelineDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'left',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6FB',
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#132849',
    textAlign: 'right',
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  modalEventText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'right',
  },
  reasonList: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  reasonOption: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reasonOptionSelected: {
    borderColor: '#1F57DC',
    backgroundColor: '#E7EFFF',
  },
  reasonOptionPressed: {
    opacity: 0.9,
  },
  reasonOptionText: {
    color: '#1E293B',
    fontWeight: '700',
    fontSize: 12,
  },
  reasonOptionTextSelected: {
    color: '#1E40AF',
  },
  reasonNoteInput: {
    borderWidth: 1,
    borderColor: '#D5E3FF',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0F172A',
    fontWeight: '600',
  },
  dialogError: {
    color: '#B91C1C',
    fontWeight: '700',
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 4,
  },
  modalCancelButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '800',
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#2F6BFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  modalPressed: {
    opacity: 0.9,
  },
  modalDisabled: {
    opacity: 0.65,
  },
});
