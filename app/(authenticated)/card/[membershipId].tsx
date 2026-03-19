import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import AnimatedActionBanner from '@/components/AnimatedActionBanner';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { normalizeStampShape } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { CUSTOMER_ROLE, useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { buildRewardProgressLine } from '@/lib/memberships/celebrationMessage';
import { safeBack } from '@/lib/navigation';

const TEXT = {
  qrCreateFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d9\u05e6\u05d5\u05e8 QR',
  missingDetails:
    '\u05d7\u05e1\u05e8\u05d9\u05dd \u05e4\u05e8\u05d8\u05d9 \u05db\u05e8\u05d8\u05d9\u05e1',
  cardNotFoundTitle:
    '\u05dc\u05d0 \u05de\u05e6\u05d0\u05e0\u05d5 \u05d0\u05ea \u05d4\u05db\u05e8\u05d8\u05d9\u05e1',
  cardNotFoundSubtitle:
    '\u05e0\u05e1\u05d4 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05dc\u05de\u05e1\u05da \u05d4\u05d0\u05e8\u05e0\u05e7 \u05d5\u05dc\u05d1\u05d7\u05d5\u05e8 \u05db\u05e8\u05d8\u05d9\u05e1 \u05de\u05d4\u05e8\u05e9\u05d9\u05de\u05d4',
  cardDetails: '\u05e4\u05e8\u05d8\u05d9 \u05db\u05e8\u05d8\u05d9\u05e1',
  personalQr: '\u05e7\u05d5\u05d3 QR \u05dc\u05e7\u05d5\u05d7',
  personalQrSubtitle:
    '\u05d4\u05e8\u05d0\u05d5 \u05d0\u05ea \u05d4\u05e7\u05d5\u05d3 \u05d1\u05e7\u05d5\u05e4\u05d4. \u05d4\u05e2\u05e1\u05e7 \u05d1\u05d5\u05d7\u05e8 \u05d0\u05ea \u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05dc\u05e4\u05e2\u05d5\u05dc\u05d4.',
  personalQrRedeemSubtitle:
    '\u05d4\u05e7\u05d5\u05d3 \u05d4\u05d6\u05d4 \u05db\u05dc\u05dc\u05d9 \u05dc\u05dc\u05e7\u05d5\u05d7. \u05d1\u05d1\u05d9\u05d6\u05e0\u05e1 \u05d1\u05d5\u05d7\u05e8\u05d9\u05dd \u05d0\u05ea \u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05dc\u05e0\u05d9\u05e7\u05d5\u05d1 \u05d0\u05d5 \u05dc\u05de\u05d9\u05de\u05d5\u05e9.',
  qrExpired:
    '\u05ea\u05d5\u05e7\u05e3 \u05d4-QR \u05e4\u05d2. \u05e8\u05e2\u05e0\u05e0\u05d5 \u05e7\u05d5\u05d3 \u05d7\u05d3\u05e9.',
  qrLoading: '\u05d8\u05d5\u05e2\u05df QR',
  refreshCta: '\u05e8\u05e2\u05e0\u05d5\u05df QR',
  loading: '\u05d8\u05d5\u05e2\u05df',
  cardReadyTitle:
    '\u05d4\u05db\u05e8\u05d8\u05d9\u05e1 \u05de\u05dc\u05d0 - \u05de\u05d7\u05db\u05d4 \u05dc\u05da \u05de\u05ea\u05e0\u05d4',
  cardReadySubtitle:
    '\u05d4\u05de\u05d9\u05de\u05d5\u05e9 \u05de\u05ea\u05d1\u05e6\u05e2 \u05d1\u05d1\u05d9\u05e7\u05d5\u05e8 \u05d4\u05d1\u05d0 \u05d1\u05e2\u05e1\u05e7\u05d4 \u05e0\u05e4\u05e8\u05d3\u05ea',
  cardPendingTitle:
    '\u05de\u05de\u05e9\u05d9\u05db\u05d9\u05dd \u05dc\u05e6\u05d1\u05d5\u05e8 \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd',
  cardPendingPrefix: '\u05e0\u05d5\u05ea\u05e8\u05d5',
  cardPendingSuffix:
    '\u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd \u05dc\u05de\u05ea\u05e0\u05d4',
  redeemButtonReady: '\u05d4\u05e6\u05d2 \u05dc\u05de\u05d9\u05de\u05d5\u05e9',
  redeemButtonLocked:
    '\u05dc\u05d0 \u05d6\u05de\u05d9\u05df \u05e2\u05d3\u05d9\u05d9\u05df',
  stampSuccessBanner: '✅ קיבלת ניקוב!',
};
const CUSTOMER_STAMP_BANNER_DURATION_MS = 5000;
const CUSTOMER_ACTIVITY_TITLE = 'פעילות בכרטיס';
const CUSTOMER_ACTIVITY_EMPTY = 'עדיין אין פעילות בכרטיס הזה.';

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CardDetailsScreen() {
  const { membershipId, preview, map } = useLocalSearchParams<{
    membershipId: string;
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const insets = useSafeAreaInsets();
  const { user, isLoading, isAuthorized } = useRoleGuard([CUSTOMER_ROLE]);
  const memberships = useQuery(api.memberships.byCustomer) as
    | CustomerMembershipView[]
    | undefined;

  const membership = memberships?.find(
    (entry) => entry.membershipId === membershipId
  );

  const createCustomerScanToken = useMutation(
    api.scanner.createCustomerScanToken
  );
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const lastCelebratedStampAtRef = useRef(0);
  const [customerStampBannerKey, setCustomerStampBannerKey] = useState(0);
  const [stampSuccessBannerMessage, setStampSuccessBannerMessage] = useState(
    TEXT.stampSuccessBanner
  );
  const scrollViewRef = useRef<ScrollView | null>(null);
  const celebrationResetTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [isCelebrationCardMode, setIsCelebrationCardMode] = useState(false);

  const membershipIdForToken = membership?.membershipId;
  const membershipActivity = useQuery(
    api.memberships.getMembershipActivity,
    membershipIdForToken
      ? {
          membershipId: membershipIdForToken as Id<'memberships'>,
          limit: 20,
        }
      : 'skip'
  );

  const refreshScanToken = useCallback(async () => {
    if (!membershipIdForToken) {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(null);
      setIsTokenLoading(false);
      return;
    }

    setIsTokenLoading(true);
    setTokenError(null);
    try {
      const result = await createCustomerScanToken({});
      setScanTokenPayload(result.scanToken);
      setTokenExpiresAt(Number(result.expiresAt));
    } catch {
      const now = Date.now();
      const hasValidToken =
        Boolean(scanTokenPayload) &&
        typeof tokenExpiresAt === 'number' &&
        now < tokenExpiresAt;
      if (!hasValidToken) {
        setScanTokenPayload(null);
        setTokenExpiresAt(null);
        setTokenError(TEXT.qrCreateFailed);
      }
    } finally {
      setIsTokenLoading(false);
    }
  }, [
    createCustomerScanToken,
    membershipIdForToken,
    scanTokenPayload,
    tokenExpiresAt,
  ]);

  useEffect(() => {
    if (!membershipIdForToken || scanTokenPayload || tokenError) {
      return;
    }
    void refreshScanToken();
  }, [membershipIdForToken, refreshScanToken, scanTokenPayload, tokenError]);

  useEffect(() => {
    if (!scanTokenPayload || !tokenExpiresAt) {
      return;
    }
    const expiryDelayMs = tokenExpiresAt - Date.now();
    if (expiryDelayMs <= 0) {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(TEXT.qrExpired);
      return;
    }
    const timer = setTimeout(() => {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(TEXT.qrExpired);
    }, expiryDelayMs + 150);
    return () => {
      clearTimeout(timer);
    };
  }, [scanTokenPayload, tokenExpiresAt]);

  useEffect(() => {
    return () => {
      if (celebrationResetTimeoutRef.current) {
        clearTimeout(celebrationResetTimeoutRef.current);
        celebrationResetTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (memberships === undefined) {
      return;
    }

    const latestStamped = memberships.reduce<{
      stampAt: number;
      membership: CustomerMembershipView | null;
    }>(
      (latest, membershipEntry) => {
        const stampAt = Number(membershipEntry.lastStampAt ?? 0);
        if (stampAt > latest.stampAt) {
          return { stampAt, membership: membershipEntry };
        }
        return latest;
      },
      { stampAt: 0, membership: null }
    );
    const latestStampAt = latestStamped.stampAt;
    const latestMembership = latestStamped.membership;

    if (!latestStampAt) {
      return;
    }

    if (latestStampAt <= lastCelebratedStampAtRef.current) {
      return;
    }

    lastCelebratedStampAtRef.current = latestStampAt;

    if (Date.now() - latestStampAt > CUSTOMER_STAMP_BANNER_DURATION_MS) {
      return;
    }

    if (celebrationResetTimeoutRef.current) {
      clearTimeout(celebrationResetTimeoutRef.current);
      celebrationResetTimeoutRef.current = null;
    }
    setIsCelebrationCardMode(true);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    celebrationResetTimeoutRef.current = setTimeout(() => {
      setIsCelebrationCardMode(false);
      celebrationResetTimeoutRef.current = null;
    }, CUSTOMER_STAMP_BANNER_DURATION_MS);

    Vibration.vibrate(120);
    if (latestMembership) {
      setStampSuccessBannerMessage(
        `${TEXT.stampSuccessBanner}\n${buildRewardProgressLine(latestMembership)}`
      );
    }
    setCustomerStampBannerKey((currentValue) => currentValue + 1);
  }, [memberships]);

  // Track QR presented event when scan token is ready
  useEffect(() => {
    if (scanTokenPayload && membershipId) {
      track(ANALYTICS_EVENTS.qrPresentedCustomer, {
        sourceScreen: 'card_detail',
        membershipId,
      });
    }
  }, [scanTokenPayload, membershipId]);

  if (isLoading || memberships === undefined) {
    return <FullScreenLoading />;
  }

  if (!user && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (!isAuthorized && !isPreviewMode) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  if (!membershipId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageText}>{TEXT.missingDetails}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!membership) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.centerMessage}>
          <Text style={styles.centerMessageTitle}>
            {TEXT.cardNotFoundTitle}
          </Text>
          <Text style={styles.centerMessageText}>
            {TEXT.cardNotFoundSubtitle}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const current = Number(membership.currentStamps ?? 0);
  const goal = Math.max(1, Number(membership.maxStamps ?? 0) || 0);
  const remainingStamps = Math.max(0, goal - current);
  const isRedeemEligible = Boolean(membership.canRedeem || current >= goal);

  const formatActivityMessage = (item: {
    actionType: string;
    businessName: string;
    programName: string;
  }) => {
    if (item.actionType === 'stamp_reverted') {
      return `בוצע תיקון בכרטיס שלך בעסק ${item.businessName} - ניקוב בוטל`;
    }
    if (item.actionType === 'reward_redeem_reverted') {
      return `בוצע תיקון בכרטיס שלך בעסק ${item.businessName} - מימוש בוטל`;
    }
    if (item.actionType === 'reward_redeemed') {
      return `מומשה הטבה בכרטיס ${item.programName}`;
    }
    return `נוסף ניקוב בכרטיס ${item.programName}`;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <AnimatedActionBanner
        eventKey={customerStampBannerKey}
        message={stampSuccessBannerMessage}
        bannerStyle={styles.stampCelebrationBanner}
        messageStyle={styles.stampCelebrationMessage}
        iconStyle={styles.stampCelebrationIcon}
        topOffset={(insets.top || 0) + 8}
        durationMs={CUSTOMER_STAMP_BANNER_DURATION_MS}
        variant="success"
        showFireworks={true}
        showConfetti={true}
        placement="center"
        emphasis="large"
        fullScreenCelebration={true}
      />
      <ScrollView
        stickyHeaderIndices={[0]}
        ref={scrollViewRef}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <View style={styles.stickyTopSection}>
          <StickyScrollHeader
            topPadding={(insets.top || 0) + 12}
            backgroundColor="#E9F0FF"
          >
            <View style={styles.headerRow}>
              <BusinessScreenHeader
                title={TEXT.cardDetails}
                subtitle={`${membership.businessName} \u00b7 ${membership.rewardName}`}
                titleAccessory={
                  <BackButton
                    onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
                  />
                }
              />
            </View>
          </StickyScrollHeader>

          <View
            style={[
              styles.card,
              isRedeemEligible
                ? styles.progressCardReady
                : styles.progressCardPending,
            ]}
          >
            <ProgramCustomerCardPreview
              businessName={membership.businessName}
              businessLogoUrl={membership.businessLogoUrl}
              title={membership.programTitle}
              rewardName={membership.rewardName}
              maxStamps={goal}
              previewCurrentStamps={current}
              cardThemeId={membership.cardThemeId}
              stampIcon={membership.stampIcon}
              stampShape={normalizeStampShape(membership.stampShape)}
              status={isRedeemEligible ? 'redeemable' : 'default'}
              variant="hero"
              showAllStamps={true}
            />

            <View
              style={[
                styles.redeemPanel,
                isRedeemEligible
                  ? styles.redeemPanelReady
                  : styles.redeemPanelPending,
              ]}
            >
              <Text
                style={[
                  styles.redeemTitle,
                  isRedeemEligible
                    ? styles.redeemTitleReady
                    : styles.redeemTitlePending,
                ]}
              >
                {isRedeemEligible ? TEXT.cardReadyTitle : TEXT.cardPendingTitle}
              </Text>
              <Text
                style={[
                  styles.redeemSubtitle,
                  isRedeemEligible
                    ? styles.redeemSubtitleReady
                    : styles.redeemSubtitlePending,
                ]}
              >
                {isRedeemEligible
                  ? TEXT.cardReadySubtitle
                  : `${TEXT.cardPendingPrefix} ${remainingStamps} ${TEXT.cardPendingSuffix}`}
              </Text>
              <Pressable
                onPress={() => void refreshScanToken()}
                disabled={
                  !isRedeemEligible || isTokenLoading || !membershipIdForToken
                }
                style={({ pressed }) => [
                  styles.redeemButton,
                  isRedeemEligible
                    ? styles.redeemButtonReady
                    : styles.redeemButtonDisabled,
                  (pressed && isRedeemEligible) || isTokenLoading
                    ? { opacity: 0.9 }
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.redeemButtonText,
                    !isRedeemEligible && styles.redeemButtonTextDisabled,
                  ]}
                >
                  {isTokenLoading && isRedeemEligible
                    ? TEXT.loading
                    : isRedeemEligible
                      ? TEXT.redeemButtonReady
                      : TEXT.redeemButtonLocked}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {!isCelebrationCardMode ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{TEXT.personalQr}</Text>
            <Text style={styles.cardSubtitle}>
              {isRedeemEligible
                ? TEXT.personalQrRedeemSubtitle
                : TEXT.personalQrSubtitle}
            </Text>
            <View style={styles.qrFrame}>
              {scanTokenPayload ? (
                <QRCode
                  value={scanTokenPayload}
                  size={200}
                  color="#1A2B4A"
                  backgroundColor="#FFFFFF"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  {isTokenLoading ? (
                    <ActivityIndicator color="#2F6BFF" />
                  ) : null}
                  <Text style={styles.qrPlaceholderText}>
                    {tokenError ? tokenError : TEXT.qrLoading}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => void refreshScanToken()}
              disabled={isTokenLoading || !membershipIdForToken}
              style={({ pressed }) => [
                styles.refreshButton,
                isTokenLoading || !membershipIdForToken
                  ? styles.refreshButtonDisabled
                  : null,
                pressed ? styles.refreshButtonPressed : null,
              ]}
            >
              <Text style={styles.refreshButtonText}>
                {isTokenLoading ? TEXT.qrLoading : TEXT.refreshCta}
              </Text>
            </Pressable>

            {tokenError ? (
              <View style={styles.errorRow}>
                <Text style={styles.errorText}>{tokenError}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{CUSTOMER_ACTIVITY_TITLE}</Text>
          {membershipActivity === undefined ? (
            <View style={styles.activityLoadingRow}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : membershipActivity.length === 0 ? (
            <Text style={styles.activityEmptyText}>
              {CUSTOMER_ACTIVITY_EMPTY}
            </Text>
          ) : (
            <View style={styles.activityList}>
              {membershipActivity.map((item) => (
                <View key={String(item.id)} style={styles.activityItem}>
                  <Text style={styles.activityMessage}>
                    {formatActivityMessage(item)}
                  </Text>
                  <Text style={styles.activityMeta}>
                    {item.programName} • {formatDateTime(item.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
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
    gap: 16,
  },
  stickyTopSection: {
    backgroundColor: '#E9F0FF',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  progressCardReady: {
    backgroundColor: '#F3FFF8',
    borderColor: '#B6E7CC',
  },
  progressCardPending: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E9FF',
  },
  redeemPanel: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  redeemPanelReady: {
    backgroundColor: '#EAFBF1',
    borderColor: '#9EDDB9',
  },
  redeemPanelPending: {
    backgroundColor: '#F5F8FF',
    borderColor: '#DCE6FF',
  },
  redeemTitle: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  redeemTitleReady: {
    color: '#0D7A3E',
  },
  redeemTitlePending: {
    color: '#1A2B4A',
  },
  redeemSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'right',
  },
  redeemSubtitleReady: {
    color: '#215E3E',
  },
  redeemSubtitlePending: {
    color: '#5B6475',
  },
  redeemButton: {
    marginTop: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemButtonReady: {
    backgroundColor: '#0D9A4B',
  },
  redeemButtonDisabled: {
    backgroundColor: '#CFDAF2',
  },
  redeemButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  redeemButtonTextDisabled: {
    color: '#5F6D86',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  qrFrame: {
    marginTop: 12,
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrPlaceholderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    borderRadius: 10,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refreshButtonPressed: {
    opacity: 0.9,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  activityLoadingRow: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityEmptyText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  activityList: {
    marginTop: 10,
    gap: 8,
  },
  activityItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3E9FA',
    backgroundColor: '#FAFCFF',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  activityMessage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#14253E',
    textAlign: 'right',
  },
  activityMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  stampCelebrationBanner: {
    backgroundColor: '#E8FFF4',
    borderColor: '#88D7AB',
    borderWidth: 2.5,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  stampCelebrationMessage: {
    color: '#0A5C35',
    fontSize: 24,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  stampCelebrationIcon: {
    color: '#0A8F4E',
    fontSize: 26,
  },
  errorRow: {
    marginTop: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D92D20',
    textAlign: 'right',
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerMessageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2B4A',
    textAlign: 'center',
  },
  centerMessageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'center',
  },
});
