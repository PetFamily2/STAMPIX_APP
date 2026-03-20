import {
  type BottomTabNavigationProp,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs';
import { type ParamListBase, useNavigation } from '@react-navigation/native';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { api } from '@/convex/_generated/api';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { buildRewardProgressLine } from '@/lib/memberships/celebrationMessage';

const TEXT = {
  title: '\u05d4-QR \u05e9\u05dc\u05d9',
  subtitle:
    '\u05e7\u05d5\u05d3 \u05dc\u05e7\u05d5\u05d7 \u05d0\u05d9\u05e9\u05d9 \u05d0\u05d7\u05d3 \u05dc\u05db\u05dc \u05d4\u05e2\u05e1\u05e7\u05d9\u05dd',
  helper:
    '\u05de\u05e6\u05d9\u05d2\u05d9\u05dd \u05d0\u05ea \u05d4\u05e7\u05d5\u05d3 \u05d1\u05e7\u05d5\u05e4\u05d4 \u05db\u05d3\u05d9 \u05dc\u05e6\u05d1\u05d5\u05e8 \u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd \u05d0\u05d5 \u05dc\u05de\u05de\u05e9 \u05d4\u05d8\u05d1\u05d4 \u05dc\u05e4\u05d9 \u05d4\u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e9\u05d4\u05e2\u05e1\u05e7 \u05d1\u05d5\u05d7\u05e8.',
  qrLoading: '\u05d8\u05d5\u05e2\u05df QR',
  qrIdle:
    '\u05dc\u05d7\u05e6\u05d5 \u05e2\u05dc \u05e8\u05e2\u05e0\u05d5\u05df QR \u05dc\u05d4\u05e6\u05d2\u05ea \u05e7\u05d5\u05d3',
  qrCreateFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d9\u05d9\u05e6\u05e8 \u05d0\u05ea \u05d4-QR, \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  qrExpired:
    '\u05ea\u05d5\u05e7\u05e3 \u05d4-QR \u05e4\u05d2. \u05e8\u05e2\u05e0\u05e0\u05d5 \u05e7\u05d5\u05d3 \u05d7\u05d3\u05e9.',
  refreshCta: '\u05e8\u05e2\u05e0\u05d5\u05df QR',
  stampSuccessBanner:
    '\uD83C\uDF89 \u05e7\u05d9\u05d1\u05dc\u05ea \u05e0\u05d9\u05e7\u05d5\u05d1!',
};

const CUSTOMER_STAMP_BANNER_DURATION_MS = 5000;

type ScanTokenResult = {
  scanToken: string;
  expiresAt: number;
};

export default function CustomerShowQrScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { isAuthenticated } = useConvexAuth();

  const memberships = useQuery(
    api.memberships.byCustomer,
    isAuthenticated ? {} : 'skip'
  ) as CustomerMembershipView[] | undefined;

  const lastCelebratedStampAtRef = useRef(0);
  const [customerStampBannerKey, setCustomerStampBannerKey] = useState(0);
  const [stampSuccessBannerMessage, setStampSuccessBannerMessage] = useState(
    TEXT.stampSuccessBanner
  );
  const didInitialQrLoadRef = useRef(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createCustomerScanToken = useMutation(
    api.scanner.createCustomerScanToken
  );
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  const refreshScanToken = useCallback(async () => {
    if (!isAuthenticated) {
      setScanTokenPayload(null);
      setTokenExpiresAt(null);
      setTokenError(null);
      setIsTokenLoading(false);
      return;
    }

    setIsTokenLoading(true);
    setTokenError(null);
    try {
      const result = (await createCustomerScanToken({})) as ScanTokenResult;
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
    isAuthenticated,
    scanTokenPayload,
    tokenExpiresAt,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      didInitialQrLoadRef.current = false;
      return;
    }
    if (didInitialQrLoadRef.current) {
      return;
    }
    didInitialQrLoadRef.current = true;
    void refreshScanToken();
  }, [isAuthenticated, refreshScanToken]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const unsubscribe = navigation.addListener('tabPress', () => {
      void refreshScanToken();
    });
    return unsubscribe;
  }, [isAuthenticated, navigation, refreshScanToken]);

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
    if (!isAuthenticated || memberships === undefined) {
      return;
    }

    const latestStamped = memberships.reduce<{
      stampAt: number;
      membership: CustomerMembershipView | null;
    }>(
      (latest, membership) => {
        const stampAt = Number(membership.lastStampAt ?? 0);
        if (stampAt > latest.stampAt) {
          return { stampAt, membership };
        }
        return latest;
      },
      { stampAt: 0, membership: null }
    );

    const latestStampAt = latestStamped.stampAt;
    const latestMembership = latestStamped.membership;
    const latestMembershipId = String(latestMembership?.membershipId ?? '');
    if (!latestStampAt || latestStampAt <= lastCelebratedStampAtRef.current) {
      return;
    }

    lastCelebratedStampAtRef.current = latestStampAt;
    if (Date.now() - latestStampAt > CUSTOMER_STAMP_BANNER_DURATION_MS) {
      return;
    }

    Vibration.vibrate(120);
    if (latestMembership) {
      setStampSuccessBannerMessage(
        `${TEXT.stampSuccessBanner}\n${buildRewardProgressLine(latestMembership)}`
      );
    }
    setCustomerStampBannerKey((current) => current + 1);
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (latestMembershipId) {
      redirectTimeoutRef.current = setTimeout(() => {
        router.replace(`/customer-card/${latestMembershipId}` as Href);
        redirectTimeoutRef.current = null;
      }, 350);
    }
  }, [isAuthenticated, memberships]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!scanTokenPayload) {
      return;
    }
    track(ANALYTICS_EVENTS.qrPresentedCustomer, {
      sourceScreen: 'customer_qr',
    });
  }, [scanTokenPayload]);

  const isLoading = isAuthenticated && isTokenLoading && !scanTokenPayload;

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

      <View
        style={[
          styles.screen,
          {
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: tabBarHeight + 14,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader
            title={TEXT.title}
            subtitle={TEXT.subtitle}
            subtitleStyle={styles.pageSubtitle}
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(customer)/wallet')
                }
              />
            }
          />
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.windowCard}>
              <ActivityIndicator color="#2F6BFF" />
              <Text style={styles.statusText}>{TEXT.qrLoading}</Text>
            </View>
          ) : null}

          {!isLoading ? (
            <View style={styles.windowCard}>
              <Text style={styles.helperText}>{TEXT.helper}</Text>
              <View style={styles.qrWindow}>
                {scanTokenPayload ? (
                  <QRCode
                    value={scanTokenPayload}
                    size={236}
                    color="#1A2B4A"
                    backgroundColor="#FFFFFF"
                  />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    {isTokenLoading ? (
                      <ActivityIndicator color="#2F6BFF" />
                    ) : null}
                    <Text style={styles.qrPlaceholderText}>
                      {tokenError
                        ? tokenError
                        : isTokenLoading
                          ? TEXT.qrLoading
                          : TEXT.qrIdle}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable
                onPress={() => void refreshScanToken()}
                disabled={isTokenLoading}
                style={({ pressed }) => [
                  styles.refreshButton,
                  isTokenLoading ? styles.refreshButtonDisabled : null,
                  pressed ? styles.refreshButtonPressed : null,
                ]}
              >
                <Text style={styles.refreshButtonText}>
                  {isTokenLoading ? TEXT.qrLoading : TEXT.refreshCta}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#DCE7FF',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#2F6BFF',
    textAlign: 'right',
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: '#DCE6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    opacity: 0.86,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  windowCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 22,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    alignItems: 'center',
    shadowColor: '#1A2B4A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
  },
  helperText: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    color: '#5B6475',
    textAlign: 'center',
  },
  qrWindow: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3E9FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  qrPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  qrPlaceholderText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    color: '#5B6475',
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    opacity: 0.9,
  },
  refreshButtonDisabled: {
    opacity: 0.65,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
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
});
