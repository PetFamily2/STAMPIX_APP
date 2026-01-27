import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack } from '@/lib/navigation';

type FitOptionId =
  | 'self'
  | 'couple'
  | 'kids'
  | 'pet'
  | 'home'
  | 'work';

const FIT_OPTIONS: Array<{ id: FitOptionId; title: string }> = [
  { id: 'self', title: 'לעצמי' },
  { id: 'couple', title: 'לי ולבן/בת זוג' },
  { id: 'kids', title: 'לילדים' },
  { id: 'pet', title: 'לחיית מחמד' },
  { id: 'home', title: 'לבית ולמשפחה' },
  { id: 'work', title: 'לעבודה (ליד העבודה / הפסקות)' },
];

export default function OnboardingFitScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<FitOptionId[]>([]);
  const canContinue = selected.length > 0;

  const toggleOption = (id: FitOptionId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (!canContinue) return;
    router.push('/(auth)/onboarding-client-frequency');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#FBFAF7]">
      <View className="flex-1 px-6 pt-4 pb-8">
        <View className="flex-row-reverse items-center justify-between">
          <BackButton onPress={() => safeBack('/(auth)/onboarding-client-usage-area')} />
          <OnboardingProgress total={7} current={6} />
        </View>

        <View className="mt-8 items-end">
          <Text className="text-2xl font-black text-gray-900 text-right mb-2">
            למי אתה רוצה שההטבות יתאימו?
          </Text>
          <Text className="text-sm font-semibold text-gray-500 text-right">
            אפשר לבחור כמה - זה עוזר לנו לדייק את ההמלצות
          </Text>
        </View>

        <View className="mt-8 gap-3">
          {FIT_OPTIONS.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <Pressable
                key={option.id}
                onPress={() => toggleOption(option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  className={
                    isSelected
                      ? 'bg-blue-600 rounded-2xl px-5 py-4 border border-blue-600 shadow-sm shadow-blue-200'
                      : 'bg-white rounded-2xl px-5 py-4 border border-gray-200 shadow-sm shadow-gray-100'
                  }
                >
                  <Text
                    className={
                      isSelected
                        ? 'text-base font-black text-white text-center'
                        : 'text-base font-black text-gray-900 text-center'
                    }
                  >
                    {option.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-auto">
          <Pressable
            onPress={handleContinue}
            className={
              canContinue
                ? 'bg-blue-600 rounded-full px-10 py-4 items-center shadow-[0_10px_30px_rgba(37,99,235,0.25)]'
                : 'bg-gray-200 rounded-full px-10 py-4 items-center'
            }
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
          >
            <Text
              className={
                canContinue
                  ? 'text-white text-lg font-bold'
                  : 'text-gray-500 text-lg font-bold'
              }
            >
              המשך
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

