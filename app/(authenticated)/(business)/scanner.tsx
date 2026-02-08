import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import QrScanner from '@/components/QrScanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import {
  trackActivationEvent,
  trackActivationOnce,
} from '@/lib/analytics/activation';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';

type ResolvedScan = {
  customerUserId: string;
  customerDisplayName: string;
  membership: {
    membershipId: string;
    currentStamps: number;
    maxStamps: number;
    canRedeemNow: boolean;
  } | null;
};

const mapScanError = (error: unknown): { message: string; code: string } => {
  if (error instanceof Error) {
    const code = error.message;
    switch (code) {
      case 'INVALID_QR':
        return { message: 'קוד QR לא תקין.', code };
      case 'EXPIRED_TOKEN':
        return { message: 'ה-QR פג תוקף. בקשו מהלקוח לרענן.', code };
      case 'TOKEN_ALREADY_USED':
        return { message: 'ה-QR כבר נסרק. בקשו מהלקוח לרענן.', code };
      case 'SELF_STAMP':
        return { message: 'לא ניתן להוסיף ניקוב לעצמך.', code };
      case 'RATE_LIMITED':
        return { message: 'המתן 30 שניות בין ניקובים לאותו לקוח.', code };
      case 'CUSTOMER_NOT_FOUND':
        return { message: 'לקוח לא נמצא במערכת.', code };
      case 'MEMBERSHIP_NOT_FOUND':
        return { message: 'לא נמצאה חברות למועדון.', code };
      case 'NOT_AUTHORIZED':
        return { message: 'אין הרשאה לבצע פעולה זו.', code };
      default:
        return { message: code, code };
    }
  }
  return { message: 'משהו השתבש. נסה שוב.', code: 'UNKNOWN' };
};

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode =
    (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { user } = useUser();
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [businessIndex, setBusinessIndex] = useState(0);
  const selectedBusiness = businesses[businessIndex] ?? businesses[0];

  useEffect(() => {
    if (businesses.length === 0) {
      setBusinessIndex(0);
      return;
    }
    if (businessIndex >= businesses.length) {
      setBusinessIndex(0);
    }
  }, [businesses.length, businessIndex]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (isAppModeLoading) return;
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs =
    useQuery(api.loyaltyPrograms.listByBusiness, {
      businessId: selectedBusiness?.businessId,
    }) ?? [];
  const [programIndex, setProgramIndex] = useState(0);
  const selectedProgram = programs[programIndex];

  useEffect(() => {
    if (programs.length === 0) {
      setProgramIndex(0);
      return;
    }
    if (programIndex >= programs.length) {
      setProgramIndex(0);
    }
  }, [programIndex, programs.length]);

  const resolveScan = useMutation(api.scanner.resolveScan);
  const addStamp = useMutation(api.scanner.addStamp);
  const [isResolving, setIsResolving] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedScan | null>(null);

  const canScan = Boolean(selectedBusiness && selectedProgram);
  const isBusy = isResolving || isStamping;

  const resolveByToken = useCallback(
    async (token: string, showErrors = true) => {
      if (!canScan) {
        if (showErrors) {
          setScanError('בחר עסק ותוכנית לפני סריקה.');
        }
        return null;
      }
      try {
        const result = (await resolveScan({
          qrData: token,
          businessId: selectedBusiness!.businessId,
          programId: selectedProgram!.loyaltyProgramId,
        })) as ResolvedScan;
        setResolved(result);
        setScanToken(token);
        setScanError(null);
        return result;
      } catch (error) {
        if (showErrors) {
          setResolved(null);
          const mapped = mapScanError(error);
          setScanError(mapped.message);
          track(ANALYTICS_EVENTS.stampFailed, {
            error_code: mapped.code,
            context: 'resolveScan',
          });
        }
        return null;
      }
    },
    [canScan, resolveScan, selectedBusiness, selectedProgram]
  );

  const handleScan = useCallback(
    async (rawData: string) => {
      if (isBusy) return;
      const data = rawData?.trim();
      if (!data) {
        setScanError('קוד QR חסר.');
        setScannerResetKey((prev) => prev + 1);
        return;
      }
      if (!data.startsWith('scanToken:')) {
        setScanError('זה QR של לקוח בלבד');
        setResolved(null);
        setScannerResetKey((prev) => prev + 1);
        return;
      }

      setIsResolving(true);
      setStatusMessage(null);
      setScanError(null);
      track(ANALYTICS_EVENTS.qrScannedCustomer, {
        businessId: selectedBusiness?.businessId,
      });
      await resolveByToken(data);
      setIsResolving(false);
      setScannerResetKey((prev) => prev + 1);
    },
    [isBusy, resolveByToken]
  );

  const handleAddStamp = useCallback(async () => {
    if (!resolved || !selectedBusiness || !selectedProgram) return;
    if (isBusy) return;
    const isFirstStampForCustomer = !resolved.membership;
    setIsStamping(true);
    setStatusMessage(null);
    setScanError(null);
    try {
      await addStamp({
        businessId: selectedBusiness.businessId,
        programId: selectedProgram.loyaltyProgramId,
        customerUserId: resolved.customerUserId as Id<'users'>,
      });
      setStatusMessage('ניקוב נוסף');
      track(ANALYTICS_EVENTS.stampSuccess, {
        businessId: selectedBusiness?.businessId,
        customerUserId: resolved.customerUserId,
      });
      if (user?._id) {
        void trackActivationOnce(
          ANALYTICS_EVENTS.firstScanCompleted,
          user._id,
          { role: 'business', userId: user._id }
        );
      }
      if (isFirstStampForCustomer) {
        void trackActivationEvent(ANALYTICS_EVENTS.customerFirstStampReceived, {
          role: 'client',
          userId: resolved.customerUserId,
        });
      }
      if (scanToken) {
        await resolveByToken(scanToken, false);
      }
    } catch (error) {
      const mapped = mapScanError(error);
      setScanError(mapped.message);
      track(ANALYTICS_EVENTS.stampFailed, {
        error_code: mapped.code,
        context: 'addStamp',
      });
    } finally {
      setIsStamping(false);
    }
  }, [
    addStamp,
    isBusy,
    resolved,
    scanToken,
    resolveByToken,
    selectedBusiness,
    selectedProgram,
    user?._id,
  ]);

  const cycleBusiness = () => {
    if (businesses.length <= 1) return;
    setBusinessIndex((prev) => (prev + 1) % businesses.length);
  };

  const cycleProgram = () => {
    if (programs.length <= 1) return;
    setProgramIndex((prev) => (prev + 1) % programs.length);
  };

  const handleRetry = () => {
    setScannerResetKey((prev) => prev + 1);
    setScanError(null);
    setStatusMessage(null);
  };

  const stampState = useMemo(() => {
    const current = Number(resolved?.membership?.currentStamps ?? 0);
    const goal = Math.max(
      1,
      Number(
        resolved?.membership?.maxStamps ?? selectedProgram?.maxStamps ?? 0
      ) || 0
    );
    const dots = Math.min(goal, 20);
    const overflow = Math.max(0, goal - dots);
    return { current, goal, dots, overflow };
  }, [
    resolved?.membership?.currentStamps,
    resolved?.membership?.maxStamps,
    selectedProgram?.maxStamps,
  ]);
  const dotIds = useMemo(
    () => Array.from({ length: stampState.dots }, (_, index) => index + 1),
    [stampState.dots]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: (insets.top || 0) + 16,
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>סריקת לקוח</Text>
          <Text style={styles.headerSubtitle}>
            סרוק QR של לקוח כדי להוסיף ניקוב.
          </Text>
        </View>

        <View style={styles.row}>
          <Pressable
            onPress={cycleBusiness}
            style={({ pressed }) => [
              styles.selectorCard,
              { opacity: pressed ? 0.85 : 1 },
              !selectedBusiness && styles.selectorCardDisabled,
            ]}
          >
            <Text style={styles.selectorTitle}>
              {selectedBusiness ? selectedBusiness.name : 'בחר עסק'}
            </Text>
            <Text style={styles.selectorSubtitle}>
              {businesses.length > 1
                ? 'לחץ להחלפה'
                : (selectedBusiness?.externalId ?? '')}
            </Text>
          </Pressable>

          <Pressable
            onPress={cycleProgram}
            style={({ pressed }) => [
              styles.selectorCard,
              { opacity: pressed ? 0.85 : 1 },
              !selectedProgram && styles.selectorCardDisabled,
            ]}
          >
            <Text style={styles.selectorTitle}>
              {selectedProgram ? selectedProgram.title : 'בחר תוכנית'}
            </Text>
            <Text style={styles.selectorSubtitle}>
              {programs.length > 1 ? 'לחץ להחלפה' : 'בחר תוכנית כדי להתחיל'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.scannerBox}>
          <QrScanner
            onScan={handleScan}
            resetKey={scannerResetKey}
            isBusy={isBusy}
          />
        </View>

        {scanError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{scanError}</Text>
          </View>
        ) : null}

        {statusMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>סטטוס לקוח</Text>
          {resolved ? (
            <>
              <Text style={styles.customerName}>
                {resolved.customerDisplayName}
              </Text>
              <Text style={styles.cardSubtitle}>
                {selectedBusiness?.name ?? ''} · {selectedProgram?.title ?? ''}
              </Text>
              <Text style={styles.progressText}>
                {stampState.current}/{stampState.goal}
              </Text>
              <View style={styles.stampRow}>
                {dotIds.map((dotId) => (
                  <View
                    key={`dot-${dotId}`}
                    style={[
                      styles.stampDot,
                      dotId <= stampState.current
                        ? { backgroundColor: '#2F6BFF', borderColor: '#2F6BFF' }
                        : styles.stampDotEmpty,
                    ]}
                  />
                ))}
                {stampState.overflow > 0 ? (
                  <Text style={styles.moreText}>+{stampState.overflow}</Text>
                ) : null}
              </View>
            </>
          ) : (
            <Text style={styles.emptyStateText}>
              סרוק QR כדי לראות פרטי לקוח.
            </Text>
          )}
        </View>

        <Pressable
          onPress={handleAddStamp}
          disabled={!resolved || isBusy}
          style={({ pressed }) => [
            styles.primaryButton,
            (!resolved || isBusy) && styles.primaryButtonDisabled,
            pressed && !isBusy && resolved ? { opacity: 0.9 } : null,
          ]}
        >
          {isStamping ? <ActivityIndicator color="#FFFFFF" /> : null}
          <Text style={styles.primaryButtonText}>
            {isStamping ? 'מוסיף...' : 'הוסף ניקוב'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleRetry}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.secondaryButtonText}>סרוק מחדש</Text>
        </Pressable>
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
  header: {
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  selectorCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 12,
  },
  selectorCardDisabled: {
    backgroundColor: '#F0F4FF',
  },
  selectorTitle: {
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'center',
  },
  selectorSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: '#5B6475',
    textAlign: 'center',
  },
  scannerBox: {
    flex: 1,
    minHeight: 240,
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
  customerName: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  progressText: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '900',
    color: '#2F6BFF',
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
  emptyStateText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 14,
  },
  statusText: {
    color: '#1A2B4A',
    fontWeight: '700',
    textAlign: 'right',
  },
  errorText: {
    color: '#D92D20',
    fontWeight: '700',
    textAlign: 'right',
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#2F6BFF',
  },
  primaryButtonDisabled: {
    backgroundColor: '#8FB3FF',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: '#D4EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8DC5FF',
  },
  secondaryButtonText: {
    color: '#2F6BFF',
    fontWeight: '900',
  },
});
