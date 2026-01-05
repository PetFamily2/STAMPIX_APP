import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '@/convex/_generated/api';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { tw } from '@/lib/rtl';

export default function CreateProgramScreen() {
  const router = useRouter();
  const {
    businessId,
    programDraft,
    setProgramDraft,
    setProgramId,
  } = useOnboarding();
  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!businessId) {
      router.replace('/merchant/onboarding/create-business');
    }
  }, [businessId, router]);

  const maxStampsNumber = Number(programDraft.maxStamps);
  const canSubmit =
    Boolean(
      programDraft.title.trim() &&
        programDraft.rewardName.trim() &&
        programDraft.stampIcon.trim() &&
        maxStampsNumber > 0
    ) && !isSubmitting;

  const handleSubmit = async () => {
    if (!businessId) {
      setError('נדרש עסק פעיל קודם');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const { loyaltyProgramId } = await createProgram({
        businessId,
        title: programDraft.title,
        rewardName: programDraft.rewardName,
        maxStamps: maxStampsNumber,
        stampIcon: programDraft.stampIcon,
      });
      setProgramId(loyaltyProgramId);
      router.push('/merchant/onboarding/preview-card');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'שגיאה ביצירת תוכנית');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#050505]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 pb-12 pt-8 space-y-6">
          <View className="space-y-1">
            <Text className={`text-zinc-300 text-xs uppercase tracking-[0.3em] ${tw.textStart}`}>
              שלב 2 מתוך 3
            </Text>
            <Text className={`text-white text-3xl font-bold ${tw.textStart}`}>הגדר תכנית נאמנות</Text>
            <Text className={`text-zinc-500 text-sm ${tw.textStart}`}>
              כל לקוח יתחיל עם כרטיס ריק וישובך לניקובים.
            </Text>
          </View>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>שם הכרטיס</Text>
              <TextInput
                value={programDraft.title}
                onChangeText={(text) => setProgramDraft((prev) => ({ ...prev, title: text }))}
                placeholder="כרטיס חם של קפה"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>

            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>הטבה</Text>
              <TextInput
                value={programDraft.rewardName}
                onChangeText={(text) => setProgramDraft((prev) => ({ ...prev, rewardName: text }))}
                placeholder="קבל כוס קפה חינם"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>

            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>מספר ניקובים</Text>
              <TextInput
                value={programDraft.maxStamps}
                onChangeText={(text) => setProgramDraft((prev) => ({ ...prev, maxStamps: text }))}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>

            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>אייקון ניקוב</Text>
              <TextInput
                value={programDraft.stampIcon}
                onChangeText={(text) => setProgramDraft((prev) => ({ ...prev, stampIcon: text }))}
                placeholder="star"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>
          </View>

          {error && (
            <Text className="text-sm text-rose-400">{error}</Text>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            className={`w-full rounded-2xl border px-4 py-4 text-center ${
              canSubmit ? 'border-emerald-400 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#4ade80" />
            ) : (
              <Text className={`text-center font-bold ${canSubmit ? 'text-emerald-200' : 'text-zinc-500'}`}>
                שמור תכנית והמשך
              </Text>
            )}
          </TouchableOpacity>

          <Text className="text-[11px] text-zinc-500">
            כמות הניקובים שקבעת כאן תוצג על כל כרטיס חדש שמניב הלקוחות.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


