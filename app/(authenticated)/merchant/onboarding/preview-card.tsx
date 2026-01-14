import { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useOnboarding } from '@/contexts/OnboardingContext';
import { tw } from '@/lib/rtl';

const Stamp = ({ filled, label }: { filled: boolean; label: string }) => (
  <View
    className={`h-10 w-10 items-center justify-center rounded-full border ${
      filled ? 'border-amber-400 bg-amber-500/20' : 'border-zinc-800 bg-transparent'
    }`}
  >
    <Text className={`text-xl font-semibold ${filled ? 'text-amber-300' : 'text-zinc-500'}`}>
      {label}
    </Text>
  </View>
);

export default function PreviewCardScreen() {
  const router = useRouter();
  const {
    businessDraft,
    programDraft,
    businessId,
    programId,
    reset,
  } = useOnboarding();

  useEffect(() => {
    if (!businessId) {
      router.replace('/merchant/onboarding/create-business');
      return;
    }
    if (!programId) {
      router.replace('/merchant/onboarding/create-program');
      return;
    }
  }, [businessId, programId, router]);

  const parsedMaxStamps = Number(programDraft.maxStamps);
  const stampCount = parsedMaxStamps > 0 ? parsedMaxStamps : 1;
  const filledCount = Math.min(3, stampCount);
  const stampLabel = programDraft.stampIcon?.trim()
    ? programDraft.stampIcon.trim().charAt(0).toUpperCase()
    : '★';

  const handleOpenScanner = () => {
    reset();
    router.replace('/business/scanner');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 pb-12 pt-8 space-y-6">
          <View className="space-y-1">
            <Text className={`text-zinc-300 text-xs uppercase tracking-[0.3em] ${tw.textStart}`}>
              שלב 3 מתוך 3
            </Text>
            <Text className={`text-white text-3xl font-bold ${tw.textStart}`}>תצוגת כרטיס</Text>
            <Text className={`text-zinc-500 text-sm ${tw.textStart}`}>
              בדוק איך הלקוחות יראו את התכנית לפני שמפעילים את הסורק.
            </Text>
          </View>

          <View className="space-y-4">
            <View className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-amber-900/30 p-5 shadow-lg shadow-black/50">
              <Text className="text-xs uppercase text-amber-200 tracking-[0.4em]">כרטיס נאמנות</Text>
              <Text className="mt-2 text-2xl font-bold text-white">{businessDraft.name || 'עסק חדש'}</Text>
              <Text className="text-sm text-zinc-300">{programDraft.rewardName}</Text>

              <View className="mt-4 flex-row flex-wrap gap-2">
                {Array.from({ length: stampCount }).map((_, index) => (
                  <Stamp key={index} filled={index < filledCount} label={stampLabel} />
                ))}
              </View>

              <View className="mt-4 rounded-2xl bg-black/30 px-4 py-3">
                <Text className="text-xs uppercase text-zinc-400">מספר ניקובים</Text>
                <Text className="text-2xl font-bold text-white">{programDraft.maxStamps}</Text>
              </View>
            </View>

            <View className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-2">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>מזהה העסק</Text>
              <Text className="text-white text-base">{businessDraft.externalId || '-'}</Text>
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>שם התכנית</Text>
              <Text className="text-white text-base">{programDraft.title}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleOpenScanner}
            disabled={!businessId || !programId}
            className="w-full rounded-2xl border border-cyan-400 bg-cyan-500/10 px-4 py-4 text-center"
          >
            <Text className="text-center font-bold text-cyan-200">פתח סורק</Text>
          </TouchableOpacity>

          <Text className="text-[11px] text-zinc-500">
            הפעולה תסיים את תהליך האונבורדינג ותעביר את העסק למסך הסורק שמוכן לניהול לקוחות.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

