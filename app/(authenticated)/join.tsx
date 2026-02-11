import { useMutation } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import QrScanner from '@/components/QrScanner';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  clearPendingJoin,
  consumePendingJoin,
} from '@/lib/deeplink/pendingJoin';
import { safeBack } from '@/lib/navigation';

const TEXT = {
  title:
    '\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05dc\u05de\u05d5\u05e2\u05d3\u05d5\u05df',
  subtitle:
    '\u05e1\u05e8\u05e7\u05d5 QR \u05e9\u05dc \u05d4\u05e2\u05e1\u05e7 \u05d0\u05d5 \u05d4\u05d3\u05d1\u05d9\u05e7\u05d5 \u05e7\u05d5\u05d3 \u05d9\u05d9\u05d7\u05d5\u05d3\u05d9',
  manualTitle:
    '\u05d0\u05d9\u05df QR? \u05d4\u05d3\u05d1\u05d9\u05e7\u05d5 \u05e7\u05d5\u05d3 \u05e2\u05e1\u05e7',
  manualPlaceholder:
    '\u05e7\u05d5\u05d3 \u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea',
  join: '\u05d4\u05e6\u05d8\u05e8\u05e3',
  checking: '\u05d1\u05d5\u05d3\u05e7...',
  scanAgain: '\u05e1\u05e8\u05d5\u05e7 \u05e9\u05d5\u05d1',
  invalidCode:
    '\u05d0\u05e0\u05d0 \u05d4\u05d6\u05df \u05e7\u05d5\u05d3 \u05e2\u05e1\u05e7 \u05ea\u05e7\u05d9\u05df.',
  invalidQr:
    '\u05d4\u05e7\u05d5\u05d3 \u05d0\u05d9\u05e0\u05d5 \u05ea\u05e7\u05d9\u05df. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.',
  businessNotFound:
    '\u05d4\u05e2\u05e1\u05e7 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0. \u05d1\u05d3\u05d5\u05e7 \u05d0\u05ea \u05d4\u05e7\u05d5\u05d3.',
  programNotFound:
    '\u05d0\u05d9\u05df \u05ea\u05d5\u05db\u05e0\u05d9\u05ea \u05e4\u05e2\u05d9\u05dc\u05d4 \u05dc\u05e2\u05e1\u05e7 \u05d4\u05d6\u05d4.',
  joinFailed:
    '\u05d4\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05e0\u05db\u05e9\u05dc\u05d4. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.',
  unexpectedError:
    '\u05d0\u05d9\u05e8\u05e2\u05d4 \u05e9\u05d2\u05d9\u05d0\u05d4 \u05dc\u05d0 \u05e6\u05e4\u05d5\u05d9\u05d4. \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1.',
  alreadyMember:
    '\u05d0\u05ea\u05d4 \u05db\u05d1\u05e8 \u05d7\u05d1\u05e8 \u05d1\u05de\u05d5\u05e2\u05d3\u05d5\u05df \u05d4\u05d6\u05d4. \u05e0\u05e4\u05ea\u05d7 \u05d0\u05ea \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d4.',
};

function getFriendlyError(error: unknown) {
  if (error instanceof Error) {
    switch (error.message) {
      case 'INVALID_QR':
        return TEXT.invalidQr;
      case 'BUSINESS_NOT_FOUND':
        return TEXT.businessNotFound;
      case 'PROGRAM_NOT_FOUND':
        return TEXT.programNotFound;
      default:
        return TEXT.joinFailed;
    }
  }
  return TEXT.unexpectedError;
}

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const joinByBusinessQr = useMutation(api.memberships.joinByBusinessQr);
  const { user } = useUser();

  // Deep link query params
  const { biz, src, camp } = useLocalSearchParams<{
    biz?: string;
    src?: string;
    camp?: string;
  }>();

  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'info';
    message: string;
  } | null>(null);

  const deepLinkProcessedRef = useRef(false);

  const doJoin = useCallback(
    async (
      qrData: string,
      source?: string | undefined,
      campaign?: string | undefined
    ) => {
      const data = (qrData ?? '').trim();
      if (!data) {
        setFeedback({ type: 'error', message: TEXT.invalidCode });
        return;
      }

      if (busy) return;

      setFeedback(null);

      try {
        setBusy(true);
        const result = await joinByBusinessQr({
          qrData: data,
          source: source || undefined,
          campaign: campaign || undefined,
        });

        await clearPendingJoin();
        setManual('');
        setScannerResetKey((prev) => prev + 1);

        if (result.alreadyExisted) {
          track(ANALYTICS_EVENTS.joinAlreadyMember, {
            businessId: result.businessId,
            src: source,
            camp: campaign,
          });
          setFeedback({ type: 'info', message: TEXT.alreadyMember });
        } else {
          track(ANALYTICS_EVENTS.joinCompleted, {
            businessId: result.businessId,
            membershipId: result.membershipId,
            src: source,
            camp: campaign,
          });
        }

        // Navigate to card in wallet
        if (result.membershipId) {
          router.replace(`/(authenticated)/card/${result.membershipId}` as any);
        } else {
          router.replace('/(authenticated)/(customer)/wallet');
        }
      } catch (error) {
        track(ANALYTICS_EVENTS.stampFailed, {
          error_code: error instanceof Error ? error.message : 'UNKNOWN',
          context: 'joinByBusinessQr',
        });
        setFeedback({ type: 'error', message: getFriendlyError(error) });
        setScannerResetKey((prev) => prev + 1);
      } finally {
        setBusy(false);
      }
    },
    [busy, joinByBusinessQr]
  );

  // Auto-join from deep link URL params or deferred join
  useEffect(() => {
    if (deepLinkProcessedRef.current) return;
    if (!user) return; // wait for auth

    // Deep link params from URL
    if (biz) {
      deepLinkProcessedRef.current = true;
      track(ANALYTICS_EVENTS.joinOpenedInApp, {
        businessPublicId: biz,
        src,
        camp,
        trigger: 'deeplink',
      });
      void doJoin(biz, src, camp);
      return;
    }

    // Check for deferred join (saved before auth redirect)
    void (async () => {
      const pending = await consumePendingJoin();
      if (pending) {
        deepLinkProcessedRef.current = true;
        track(ANALYTICS_EVENTS.joinOpenedInApp, {
          businessPublicId: pending.biz,
          src: pending.src,
          camp: pending.camp,
          trigger: 'deferred',
        });
        void doJoin(pending.biz, pending.src, pending.camp);
      }
    })();
  }, [biz, src, camp, user, doJoin]);

  const handleScan = useCallback(
    async (rawData: string) => {
      const data = rawData?.trim();
      if (!data) {
        setFeedback({ type: 'error', message: TEXT.invalidCode });
        setScannerResetKey((prev) => prev + 1);
        return;
      }

      track(ANALYTICS_EVENTS.qrScannedBusinessJoin, {
        raw_length: data.length,
        is_url: data.startsWith('http'),
      });

      await doJoin(data);
    },
    [doJoin]
  );

  const handleManual = useCallback(() => {
    const code = manual.trim();
    if (!code) return;

    track(ANALYTICS_EVENTS.qrScannedBusinessJoin, {
      raw_length: code.length,
      is_url: false,
      trigger: 'manual',
    });

    doJoin(code);
  }, [doJoin, manual]);

  const handleRetryScan = () => {
    setScannerResetKey((prev) => prev + 1);
    setFeedback(null);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#E9F0FF' }}
      edges={['top']}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: (insets.top || 0) + 16,
            paddingHorizontal: 24,
            paddingBottom: 8,
          }}
        >
          <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <BackButton
              onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
            />
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '900',
              color: '#1A2B4A',
              textAlign: 'right',
            }}
          >
            {TEXT.title}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              fontWeight: '700',
              color: '#2F6BFF',
              textAlign: 'right',
            }}
          >
            {TEXT.subtitle}
          </Text>
          {feedback ? (
            <Text
              style={{
                marginTop: 10,
                fontSize: 13,
                color: feedback.type === 'error' ? '#D92D20' : '#0B922A',
                textAlign: 'right',
              }}
            >
              {feedback.message}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
          <QrScanner
            onScan={handleScan}
            resetKey={scannerResetKey}
            isBusy={busy}
          />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: (insets.bottom || 0) + 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#E3E9FF',
            padding: 16,
          }}
        >
          <Text
            style={{ textAlign: 'right', fontWeight: '900', color: '#0B1220' }}
          >
            {TEXT.manualTitle}
          </Text>
          <TextInput
            value={manual}
            onChangeText={setManual}
            onSubmitEditing={handleManual}
            returnKeyType="done"
            keyboardType="default"
            autoCapitalize="characters"
            placeholder={TEXT.manualPlaceholder}
            placeholderTextColor="#9AA4B2"
            style={{
              height: 44,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#E3E9FF',
              paddingHorizontal: 12,
              textAlign: 'right',
              color: '#0B1220',
              backgroundColor: '#F6F8FC',
              fontWeight: '700',
              marginTop: 10,
            }}
          />

          <Pressable
            onPress={handleManual}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              backgroundColor: '#2F6BFF',
              opacity: pressed ? 0.85 : 1,
              marginTop: 12,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
              {busy ? TEXT.checking : TEXT.join}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleRetryScan}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              backgroundColor: '#D4EDFF',
              opacity: pressed ? 0.85 : 1,
              marginTop: 10,
            })}
          >
            <Text style={{ color: '#2F6BFF', fontWeight: '900' }}>
              {TEXT.scanAgain}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
