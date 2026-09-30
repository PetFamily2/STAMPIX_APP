import {
  type BottomTabNavigationProp,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs';
import { type ParamListBase, useNavigation } from '@react-navigation/native';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { PaintedPressable } from '@/components/ui/PaintedPressable';
import { api } from '@/convex/_generated/api';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS,
  clearCustomerStampNavigationTarget,
  getCustomerStampCelebrationSessionEpoch,
  noteCustomerStampNavigationTarget,
  observeCustomerStampCelebrationChannel,
  toCustomerStampMembershipSnapshots,
} from '@/lib/customer/customerStampCelebration';
import {
  readCustomerStampCelebrationArmSnapshot,
  useCustomerStampCelebrationArm,
} from '@/lib/customer/customerStampCelebrationArm';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import {
  CUSTOMER_ROUTES,
  customerCardRoute,
} from '@/lib/navigation/customerRoutes';

const TEXT = {
  title: 'ה-QR שלי',
  subtitle: 'קוד לקוח אישי אחד לכל העסקים',
  helper: 'הציגו את הקוד בקופה כדי להצטרף לכרטיסייה, לקבל חותמת או לממש הטבה',
  qrLoading: 'טוען QR',
  qrIdle: 'לחצו על רענון QR להצגת קוד',
  qrCreateFailed: 'לא הצלחנו לייצר את ה-QR, נסו שוב.',
  qrExpired: 'תוקף ה-QR פג. רעננו קוד חדש.',
  refreshCta: 'רענון QR',
};

type ScanTokenResult = {
  scanToken: string;
  expiresAt: number;
};

export default function CustomerShowQrScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { isAuthenticated } = useConvexAuth();
  const { serverArmedAt, serverArmFailed } = useCustomerStampCelebrationArm();

  const memberships = useQuery(
    api.memberships.byCustomer,
    isAuthenticated ? {} : 'skip'
  ) as CustomerMembershipView[] | undefined;

  const didInitialQrLoadRef = useRef(false);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledMembershipIdRef = useRef<string | null>(null);

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
    if (!isAuthenticated) {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      scheduledMembershipIdRef.current = null;
      clearCustomerStampNavigationTarget();
      return;
    }

    const arm = readCustomerStampCelebrationArmSnapshot();
    const scheduledEpoch = getCustomerStampCelebrationSessionEpoch();
    const armWasReset =
      serverArmedAt !== arm.serverArmedAt ||
      serverArmFailed !== arm.serverArmFailed;
    const celebrations = observeCustomerStampCelebrationChannel('navigation', {
      memberships: toCustomerStampMembershipSnapshots(memberships),
      serverArmedAt: armWasReset ? arm.serverArmedAt : serverArmedAt,
      serverArmFailed: armWasReset ? arm.serverArmFailed : serverArmFailed,
    });
    const latestMembershipId = noteCustomerStampNavigationTarget(celebrations);
    if (!latestMembershipId) {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      scheduledMembershipIdRef.current = null;
      return;
    }
    if (
      redirectTimeoutRef.current &&
      scheduledMembershipIdRef.current === latestMembershipId
    ) {
      return;
    }

    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
    scheduledMembershipIdRef.current = latestMembershipId;
    redirectTimeoutRef.current = setTimeout(() => {
      if (getCustomerStampCelebrationSessionEpoch() !== scheduledEpoch) {
        redirectTimeoutRef.current = null;
        scheduledMembershipIdRef.current = null;
        return;
      }
      clearCustomerStampNavigationTarget();
      scheduledMembershipIdRef.current = null;
      router.replace(customerCardRoute(latestMembershipId) as Href);
      redirectTimeoutRef.current = null;
    }, CUSTOMER_STAMP_QR_TO_CARD_DELAY_MS);
  }, [isAuthenticated, memberships, serverArmFailed, serverArmedAt]);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      scheduledMembershipIdRef.current = null;
      clearCustomerStampNavigationTarget();
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
                onPress={() => router.replace(CUSTOMER_ROUTES.wallet)}
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
              <PaintedPressable
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
              </PaintedPressable>
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
    width: '100%',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
  },
  helperText: {
    width: '100%',
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    color: '#5B6475',
    textAlign: 'right',
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
    width: '100%',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    color: '#5B6475',
    textAlign: 'right',
  },
  refreshButton: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 10,
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
});
