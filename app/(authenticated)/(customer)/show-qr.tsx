import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
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
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { api } from '@/convex/_generated/api';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';

const TEXT = {
  title: '\u05d4-QR \u05e9\u05dc\u05d9',
  subtitle:
    '\u05de\u05e6\u05d9\u05d2\u05d9\u05dd QR \u05d0\u05d9\u05e9\u05d9 \u05d0\u05d7\u05d3 \u05dc\u05db\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea',
  loadingMemberships:
    '\u05d8\u05d5\u05e2\u05df \u05d0\u05ea \u05d4-QR \u05e9\u05dc\u05da',
  emptyTitle:
    '\u05d0\u05d9\u05df \u05db\u05e8\u05d8\u05d9\u05e1 \u05e4\u05e2\u05d9\u05dc',
  emptySubtitle:
    '\u05db\u05d0\u05e9\u05e8 \u05ea\u05e6\u05d8\u05e8\u05e4\u05d5 \u05dc\u05dc\u05e4\u05d7\u05d5\u05ea \u05e2\u05e1\u05e7 \u05d0\u05d7\u05d3, \u05d4-QR \u05d9\u05d5\u05e4\u05d9\u05e2 \u05db\u05d0\u05df',
  qrLoading: '\u05d8\u05d5\u05e2\u05df QR',
  qrCreateFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d9\u05e6\u05d5\u05e8 \u05d0\u05ea \u05d4-QR \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1',
  stampSuccessBanner: 'ניקוב נוסף בהצלחה לכרטיס שלך',
};
const CUSTOMER_STAMP_BANNER_DURATION_MS = 5000;

type CustomerBusinessSummary = {
  businessId: string;
};

export default function CustomerShowQrScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const { isAuthenticated } = useConvexAuth();

  const savedBusinessesQuery = useQuery(
    api.memberships.byCustomerBusinesses,
    isAuthenticated ? {} : 'skip'
  );
  const savedBusinesses = (savedBusinessesQuery ??
    []) as CustomerBusinessSummary[];
  const hasAnyMembership = savedBusinesses.length > 0;
  const memberships = useQuery(
    api.memberships.byCustomer,
    isAuthenticated ? {} : 'skip'
  ) as CustomerMembershipView[] | undefined;

  const lastCelebratedStampAtRef = useRef(0);
  const [customerStampBannerKey, setCustomerStampBannerKey] = useState(0);

  const createCustomerScanToken = useMutation(
    api.scanner.createCustomerScanToken
  );
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

  const refreshScanToken = useCallback(async () => {
    if (!hasAnyMembership) {
      setScanTokenPayload(null);
      setTokenError(null);
      setIsTokenLoading(false);
      return;
    }

    setIsTokenLoading(true);
    setTokenError(null);
    try {
      const result = await createCustomerScanToken({});
      setScanTokenPayload(result.scanToken);
    } catch {
      setScanTokenPayload(null);
      setTokenError(TEXT.qrCreateFailed);
    } finally {
      setIsTokenLoading(false);
    }
  }, [createCustomerScanToken, hasAnyMembership]);

  useFocusEffect(
    useCallback(() => {
      void refreshScanToken();
    }, [refreshScanToken])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        void refreshScanToken();
      }
    });

    return unsubscribe;
  }, [navigation, refreshScanToken]);

  useEffect(() => {
    if (!isAuthenticated || memberships === undefined) {
      return;
    }

    const latestStampAt = memberships.reduce((latest, membership) => {
      const stampAt = Number(membership.lastStampAt ?? 0);
      return Math.max(latest, stampAt);
    }, 0);

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

    Vibration.vibrate(120);
    setCustomerStampBannerKey((current) => current + 1);
  }, [isAuthenticated, memberships]);

  const isLoading = isAuthenticated && savedBusinessesQuery === undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <AnimatedActionBanner
        eventKey={customerStampBannerKey}
        message={TEXT.stampSuccessBanner}
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
              <Pressable
                onPress={() =>
                  router.replace('/(authenticated)/(customer)/wallet')
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.closeButtonPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close QR screen"
              >
                <Ionicons name="close" size={22} color="#1A2B4A" />
              </Pressable>
            }
          />
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.windowCard}>
              <ActivityIndicator color="#2F6BFF" />
              <Text style={styles.statusText}>{TEXT.loadingMemberships}</Text>
            </View>
          ) : null}

          {!isLoading && !hasAnyMembership ? (
            <View style={styles.windowCard}>
              <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
              <Text style={styles.emptySubtitle}>{TEXT.emptySubtitle}</Text>
            </View>
          ) : null}

          {!isLoading && hasAnyMembership ? (
            <View style={styles.windowCard}>
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
                      {tokenError ? tokenError : TEXT.qrLoading}
                    </Text>
                  </View>
                )}
              </View>
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
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
});
