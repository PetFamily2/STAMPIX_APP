import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { CUSTOMER_ROLE, useRoleGuard } from '@/lib/hooks/useRoleGuard';
import { tw } from '@/lib/rtl';

export default function CardDetailsScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const router = useRouter();
  const { user, isLoading, isAuthorized } = useRoleGuard([CUSTOMER_ROLE]);
  const memberships = useQuery(api.memberships.byCustomer) as
    | CustomerMembershipView[]
    | undefined;

  const membership = memberships?.find((entry) => entry.membershipId === membershipId);

  const createScanToken = useMutation(api.scanner.createScanToken);
  const [scanTokenPayload, setScanTokenPayload] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isTokenLoading, setIsTokenLoading] = useState(false);

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
      const result = await createScanToken({ membershipId: membershipIdForToken as any });
      setScanTokenPayload(result.scanToken);
    } catch {
      setScanTokenPayload(null);
      setTokenError('שגיאה ביצירת QR מאובטח');
    } finally {
      setIsTokenLoading(false);
    }
  }, [createScanToken, membershipIdForToken]);

  useEffect(() => {
    void refreshScanToken();
  }, [refreshScanToken]);

  if (isLoading || memberships === undefined) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!isAuthorized) {
    return <Redirect href="/(authenticated)/business/dashboard" />;
  }

  if (!membershipId) {
    return (
      <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm text-zinc-400">הכרטיס לא זמין</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!membership) {
    return (
      <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-white mb-2">כרטיס אינו זמין</Text>
          <Text className="text-sm text-zinc-400 text-center">
            עדיין לא נרשם ניקוב עבור כרטיס זה או שאינו שויך לחשבון הנוכחי.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const progressPercent =
    membership.maxStamps > 0
      ? Math.min(Math.round((membership.currentStamps / membership.maxStamps) * 100), 100)
      : 0;

  const lastStamp = new Date(membership.lastStampAt);
  const formattedDate = lastStamp.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
  });
  const formattedTime = lastStamp.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const qrUri = scanTokenPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
        scanTokenPayload
      )}`
    : null;

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 py-6 space-y-6">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-12 rounded-full border border-zinc-800 bg-zinc-900/70 p-2"
          >
            <ChevronLeft size={20} color="#94a3b8" />
          </TouchableOpacity>

          <View className="space-y-2">
            <Text className={`text-3xl font-bold text-white ${tw.textStart}`}>פרטי כרטיס</Text>
            <Text className="text-sm text-zinc-400">
              {membership.businessName} · {membership.programTitle}
            </Text>
          </View>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <View className="flex-row items-center justify-between">
              <View className="space-y-1">
                <Text className="text-3xl font-black text-cyan-400">
                  {membership.currentStamps} / {membership.maxStamps}
                </Text>
                <Text className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {membership.rewardName}
                </Text>
              </View>
              <Text
                className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  membership.canRedeem
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {membership.canRedeem ? 'מוכן למימוש' : 'הטבה בתהליך'}
              </Text>
            </View>

            <View className="h-2 w-full rounded-full bg-zinc-800">
              <View
                className="h-full rounded-full bg-cyan-500"
                style={{ width: `${progressPercent}%` }}
              />
            </View>

            <Text className="text-xs text-zinc-500">
              ניקובים אחרונים: {formattedDate} · {formattedTime}
            </Text>
          </View>

          <View className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <Text className="text-sm font-semibold text-white">QR אישי</Text>
            <Text className="text-xs text-zinc-500">
              הראה/י את ה-QR הזה לצוות כדי לקבל ניקוב או מימוש. הנתונים המשותפים:
            </Text>
            <View className="h-64 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {qrUri ? (
                <Image
                  source={{ uri: qrUri }}
                  className="h-full w-full bg-zinc-950"
                  resizeMode="contain"
                />
              ) : (
                <View className="flex h-full w-full flex-col items-center justify-center gap-2">
                  <ActivityIndicator color="#4fc3f7" />
                  <Text className="text-[11px] text-zinc-500">
                    {tokenError ? 'שגיאה ביצירת ה-QR' : 'יוצר QR מאובטח...'}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                void refreshScanToken();
              }}
              disabled={isTokenLoading || !membershipIdForToken}
              className={`rounded-xl border px-4 py-3 text-center ${
                isTokenLoading || !membershipIdForToken
                  ? 'border-zinc-800 bg-zinc-800/80'
                  : 'border-cyan-500 bg-cyan-500/10'
              }`}
            >
              <Text
                className={`font-bold ${
                  isTokenLoading || !membershipIdForToken ? 'text-zinc-500' : 'text-cyan-300'
                }`}
              >
                {isTokenLoading ? 'מרענן...' : 'רענן QR מאובטח'}
              </Text>
            </TouchableOpacity>
            {tokenError && (
              <Text className={`text-xs text-rose-400 ${tw.textStart}`}>{tokenError}</Text>
            )}
            <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
              <Text className="text-xs text-zinc-500">Payload</Text>
              <Text className="break-all text-sm text-white">
                {scanTokenPayload ?? 'טוען QR מאובטח...'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

