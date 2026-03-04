import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { CUSTOMER_ROLE, useRoleGuard } from '@/lib/hooks/useRoleGuard';
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
  personalQr: 'QR \u05d0\u05d9\u05e9\u05d9',
  personalQrSubtitle:
    '\u05d4\u05e8\u05d0\u05d4 \u05dc\u05e6\u05d5\u05d5\u05ea \u05db\u05d3\u05d9 \u05dc\u05e7\u05d1\u05dc \u05e0\u05d9\u05e7\u05d5\u05d1',
  personalQrRedeemSubtitle:
    '\u05d4\u05e8\u05d0\u05d4 \u05dc\u05e6\u05d5\u05d5\u05ea \u05db\u05d3\u05d9 \u05dc\u05de\u05de\u05e9 \u05d0\u05ea \u05d4\u05de\u05ea\u05e0\u05d4 \u05d1\u05e2\u05e1\u05e7\u05d4 \u05e0\u05e4\u05e8\u05d3\u05ea',
  qrCreateTokenError:
    '\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d9\u05e6\u05d5\u05e8 QR',
  qrLoading: '\u05d8\u05d5\u05e2\u05df QR',
  genericError:
    '\u05de\u05e9\u05d4\u05d5 \u05d4\u05e9\u05ea\u05d1\u05e9 \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1',
  retry: '\u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1',
  loading: '\u05d8\u05d5\u05e2\u05df',
  refreshQr: '\u05e8\u05e2\u05e0\u05df QR',
  hidePayload: '\u05d4\u05e1\u05ea\u05e8 Payload',
  showPayload: '\u05d4\u05e6\u05d2 Payload',
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
};

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

  const createScanToken = useMutation(api.scanner.createScanToken);
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const membershipIdForToken = membership?.membershipId;

  const refreshScanToken = useCallback(async () => {
    if (!membershipIdForToken) {
      setScanTokenPayload(null);
      setTokenError(null);
      setIsTokenLoading(false);
      return;
    }

    setIsTokenLoading(true);
    setTokenError(null);
    try {
      const result = await createScanToken({
        membershipId: membershipIdForToken as Id<'memberships'>,
      });
      setScanTokenPayload(result.scanToken);
    } catch {
      setScanTokenPayload(null);
      setTokenError(TEXT.qrCreateFailed);
    } finally {
      setIsTokenLoading(false);
    }
  }, [createScanToken, membershipIdForToken]);

  useEffect(() => {
    void refreshScanToken();
  }, [refreshScanToken]);

  // Track QR presented event when scan token is ready
  useEffect(() => {
    if (scanTokenPayload && membershipId) {
      track(ANALYTICS_EVENTS.qrPresentedCustomer, {
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
  const dots = Math.min(goal, 20);
  const overflow = Math.max(0, goal - dots);
  const dotIds = Array.from({ length: dots }, (_, index) => index + 1);

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
            title={TEXT.cardDetails}
            subtitle={`${membership.businessName} \u00b7 ${membership.rewardName}`}
            titleAccessory={
              <Pressable
                onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="\u05d7\u05d6\u05e8\u05d4"
              >
                <Ionicons name="chevron-forward" size={20} color="#111827" />
              </Pressable>
            }
          />
        </View>

        <View
          style={[
            styles.card,
            isRedeemEligible
              ? styles.progressCardReady
              : styles.progressCardPending,
          ]}
        >
          <Text style={styles.progressText}>
            {current}/{goal}
          </Text>
          <Text style={styles.rewardText}>{membership.rewardName}</Text>
          <View style={styles.stampRow}>
            {dotIds.map((dotId) => (
              <View
                key={`${membership.membershipId}-dot-${dotId}`}
                style={[
                  styles.stampDot,
                  dotId <= current
                    ? { backgroundColor: '#2F6BFF', borderColor: '#2F6BFF' }
                    : styles.stampDotEmpty,
                ]}
              />
            ))}
            {overflow > 0 ? (
              <Text style={styles.moreText}>+{overflow}</Text>
            ) : null}
          </View>

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
                {isTokenLoading ? <ActivityIndicator color="#2F6BFF" /> : null}
                <Text style={styles.qrPlaceholderText}>
                  {tokenError ? TEXT.qrCreateTokenError : TEXT.qrLoading}
                </Text>
              </View>
            )}
          </View>

          {scanTokenPayload ? (
            <Text style={styles.qrPayloadText}>{scanTokenPayload}</Text>
          ) : null}

          {tokenError ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{TEXT.genericError}</Text>
              <Pressable
                onPress={() => void refreshScanToken()}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>{TEXT.retry}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => void refreshScanToken()}
              disabled={isTokenLoading || !membershipIdForToken}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || isTokenLoading || !membershipIdForToken) && {
                  opacity: 0.7,
                },
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isTokenLoading ? TEXT.loading : TEXT.refreshQr}
              </Text>
            </Pressable>
          )}
        </View>

        {process.env.NODE_ENV !== 'production' ? (
          <View style={styles.devSection}>
            <Pressable
              onPress={() => setShowPayload((prev) => !prev)}
              style={({ pressed }) => [
                styles.devToggle,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.devToggleText}>
                {showPayload ? TEXT.hidePayload : TEXT.showPayload}
              </Text>
            </Pressable>
            {showPayload ? (
              <View style={styles.payloadBox}>
                <Text style={styles.payloadText}>
                  {scanTokenPayload ?? TEXT.qrLoading}
                </Text>
              </View>
            ) : null}
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
    gap: 16,
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
  progressText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  rewardText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#0B1220',
    textAlign: 'right',
  },
  stampRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  stampDotEmpty: {
    borderColor: '#E5EAF5',
    backgroundColor: '#E9EEF9',
  },
  moreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B6475',
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
  qrPayloadText: {
    marginTop: 8,
    fontSize: 11,
    color: '#5B6475',
    textAlign: 'center',
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
  primaryButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#2F6BFF',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
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
  devSection: {
    gap: 8,
  },
  devToggle: {
    alignSelf: 'flex-start',
    backgroundColor: '#D4EDFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  devToggleText: {
    color: '#2F6BFF',
    fontWeight: '800',
    fontSize: 12,
  },
  payloadBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  payloadText: {
    fontSize: 11,
    color: '#5B6475',
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
