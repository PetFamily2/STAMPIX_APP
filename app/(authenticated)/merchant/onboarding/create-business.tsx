import { useMutation } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '@/convex/_generated/api';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { tw } from '@/lib/rtl';

export default function CreateBusinessScreen() {
  const router = useRouter();
  const { businessDraft, setBusinessDraft, setBusinessId } = useOnboarding();
  const createBusiness = useMutation(api.business.createBusiness);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slugSuggestion = useMemo(() => {
    if (!businessDraft.name) return '';
    return businessDraft.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [businessDraft.name]);

  const canSubmit =
    Boolean(businessDraft.name.trim() && businessDraft.externalId.trim()) && !isSubmitting;

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { businessId } = await createBusiness({
        name: businessDraft.name,
        externalId: businessDraft.externalId,
        logoUrl: businessDraft.logoUrl,
        colors: businessDraft.colors,
      });
      setBusinessId(businessId);
      router.push('/merchant/onboarding/create-program');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'שגיאה ביצירת העסק');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!businessDraft.externalId && slugSuggestion) {
      setBusinessDraft((prev) => ({ ...prev, externalId: slugSuggestion }));
    }
  }, [slugSuggestion, businessDraft.externalId, setBusinessDraft]);

  return (
    <SafeAreaView className="flex-1 bg-[#050505]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 pb-12 pt-8 space-y-6">
          <View className="space-y-1">
            <Text className={`text-zinc-300 text-xs uppercase tracking-[0.3em] ${tw.textStart}`}>שלב 1 מתוך 3</Text>
            <Text className={`text-white text-3xl font-bold ${tw.textStart}`}>צור את העסק שלך</Text>
            <Text className={`text-zinc-500 text-sm ${tw.textStart}`}>עסק פעיל מחובר ישירות אליך. אין דילוג על השלב.</Text>
          </View>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>שם העסק</Text>
              <TextInput
                value={businessDraft.name}
                onChangeText={(text) => setBusinessDraft((prev) => ({ ...prev, name: text }))}
                placeholder="למשל: קפה ירושלים"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>

            <View className="space-y-1">
              <View className="flex-row items-center justify-between">
                <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>מזהה עסק (externalId)</Text>
                {slugSuggestion ? (
                  <TouchableOpacity
                    onPress={() => setBusinessDraft((prev) => ({ ...prev, externalId: slugSuggestion }))}
                    disabled={isSubmitting}
                  >
                    <Text className="text-sky-400 text-[11px] font-semibold">שמור קיצור</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                value={businessDraft.externalId}
                onChangeText={(text) => setBusinessDraft((prev) => ({ ...prev, externalId: text }))}
                placeholder="כותרת-עסק-ייחודית"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
                autoCapitalize="none"
              />
              {slugSuggestion ? (
                <Text className="text-[11px] text-zinc-500">{`הצעה: ${slugSuggestion}`}</Text>
              ) : null}
            </View>

            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>חיבור חזותי (אופציונלי)</Text>
              <TextInput
                value={businessDraft.logoUrl ?? ''}
                onChangeText={(text) => setBusinessDraft((prev) => ({ ...prev, logoUrl: text || undefined }))}
                placeholder="קישור ללוגו / אייקון"
                placeholderTextColor="#52525b"
                className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
              />
            </View>

            <View className="space-y-1">
              <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>צבעים (אופציונלי)</Text>
              <TextInput
                value={businessDraft.colors ?? ''}
                onChangeText={(text) => setBusinessDraft((prev) => ({ ...prev, colors: text || undefined }))}
                placeholder="למשל: #0f172a"
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
              canSubmit ? 'border-sky-400 bg-sky-500/10' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#4fc3f7" />
            ) : (
              <Text className={`text-center font-bold ${canSubmit ? 'text-sky-200' : 'text-zinc-500'}`}>
                שמור ועבור לשלב הבא
              </Text>
            )}
          </TouchableOpacity>

          <Text className="text-[11px] text-zinc-500">
            העסק המוגדר כאן ישמש כ-biz ID שמאפשר לקוחות לעבור לסורק ללא Seed.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


