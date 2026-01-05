import { Redirect } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useRoleGuard, CUSTOMER_ROLE } from '@/lib/hooks/useRoleGuard';
import { tw } from '@/lib/rtl';

const DISCOVERY_TIPS = [
  {
    id: '1',
    title: 'Cafe +ניקוד',
    subtitle: 'קבל מתנה לאחר 8 ניקובים',
  },
  {
    id: '2',
    title: 'בייקרי לילה',
    subtitle: 'חמישה קינוחים ב-40 ש"ח',
  },
  {
    id: '3',
    title: 'ספרייה מקומית',
    subtitle: 'ניקוד כפול באירועים',
  },
];

export default function DiscoveryScreen() {
  const { isLoading, user, isAuthorized } = useRoleGuard([CUSTOMER_ROLE]);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!isAuthorized) {
    return <Redirect href="/(authenticated)/business/dashboard" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#050505]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 py-8 space-y-5">
          <Text className={`text-4xl font-bold text-white ${tw.textStart}`}>Discovery</Text>
          <Text className={`text-sm text-zinc-400 ${tw.textStart}`}>
            המקום שבו תוכל לגלות עסקים חדשים ולהרוויח ניקודים
          </Text>

          <View className="space-y-3">
            {DISCOVERY_TIPS.map((tip) => (
              <View
                key={tip.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 space-y-2"
              >
                <Text className="text-xl font-bold text-white">{tip.title}</Text>
                <Text className="text-sm text-zinc-400">{tip.subtitle}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


