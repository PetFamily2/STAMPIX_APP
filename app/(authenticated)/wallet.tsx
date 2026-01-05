import { Redirect, useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { ChevronRight } from 'lucide-react-native';

import type { CustomerMembershipView } from '@/lib/domain/customerMemberships';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useRoleGuard, CUSTOMER_ROLE } from '@/lib/hooks/useRoleGuard';
import { tw } from '@/lib/rtl';
import { api } from '@/convex/_generated/api';

export default function WalletScreen() {
  const { user, isLoading, isAuthorized } = useRoleGuard([CUSTOMER_ROLE]);
  const router = useRouter();
  const memberships = useQuery(api.memberships.byCustomer) as
    | CustomerMembershipView[]
    | undefined;

  if (isLoading || memberships === undefined) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!isAuthorized) {
    return <Redirect href="/(authenticated)/business/dashboard" />;
  }

  const displayName = user.fullName ?? user.email?.split('@')[0] ?? 'לקוח';
  const totalStamps = memberships.reduce((sum, membership) => sum + membership.currentStamps, 0);
  const totalMax = memberships.reduce((sum, membership) => sum + membership.maxStamps, 0);
  const overallProgress = totalMax ? Math.min(totalStamps / totalMax, 1) : 0;

  const openCard = (membershipId: string) => {
    router.push(`/(authenticated)/card/${membershipId}` as any);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
          <View className="space-y-1">
            <Text className={`text-4xl font-black text-white ${tw.textStart}`}>ארנק</Text>
            <Text className={`text-sm text-zinc-400 ${tw.textStart}`}>
              שלום {displayName}, הנה כל הכרטיסים הפעילים שלך.
            </Text>
          </View>

          <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <Text className="text-xs uppercase tracking-wider text-zinc-500">
              התקדמות כוללת
            </Text>
            <Text className="text-3xl font-black text-cyan-400">
              {totalStamps} / {totalMax || 10}
            </Text>
            <View className="h-2 w-full rounded-full bg-zinc-800">
              <View
                className="h-full rounded-full bg-cyan-500"
                style={{ width: `${Math.round(overallProgress * 100)}%` }}
              />
            </View>
            <Text className="text-sm text-zinc-400">
              {memberships.length} כרטיס{memberships.length === 1 ? '' : 'ים'} פעיל{memberships.length === 1 ? '' : 'ים'}
            </Text>
          </View>

          {memberships.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 p-5 space-y-2">
              <Text className="text-sm text-zinc-400">
                נסרק עוד לא כרטיס? בקר בחנות הקרובה וקבל ניקוב ראשון.
              </Text>
            </View>
          ) : (
            <View className="space-y-4">
              {memberships.map((membership) => {
                const percent =
                  membership.maxStamps > 0
                    ? Math.min(
                        Math.round((membership.currentStamps / membership.maxStamps) * 100),
                        100
                      )
                    : 0;
                const stampLabel = `${membership.currentStamps} / ${membership.maxStamps}`;
                const lastStamp = new Date(membership.lastStampAt);
                const formattedDate = lastStamp.toLocaleDateString('he-IL', {
                  day: 'numeric',
                  month: 'short',
                });
                const formattedTime = lastStamp.toLocaleTimeString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <TouchableOpacity
                    key={membership.membershipId}
                    onPress={() => openCard(membership.membershipId)}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900 px-5 py-4 space-y-3 active:scale-[0.99]"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="space-y-1">
                        <Text className="text-lg font-semibold text-white">
                          {membership.businessName}
                        </Text>
                        <Text className="text-xs text-zinc-400">{membership.programTitle}</Text>
                      </View>
                      <View className="flex items-end space-y-1">
                        <Text
                          className={`text-[11px] rounded-full px-3 py-1 font-semibold tracking-wider ${
                            membership.canRedeem
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {membership.canRedeem ? 'מוכן למימוש' : 'בדרך להטבה'}
                        </Text>
                        <ChevronRight size={20} color="#94a3b8" />
                      </View>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <View className="space-y-1">
                        <Text className="text-2xl font-black text-cyan-400">{stampLabel}</Text>
                        <Text className="text-xs text-zinc-500">{membership.rewardName}</Text>
                      </View>
                      <Text className="text-xs text-zinc-500">
                        {formattedDate} · {formattedTime}
                      </Text>
                    </View>
                    <View className="h-2 w-full rounded-full bg-zinc-800">
                      <View
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${percent}%` }}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}