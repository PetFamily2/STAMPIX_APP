import { useMutation } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import { LoyaltyThemePalette } from '@/components/loyalty/LoyaltyThemePalette';
import { StampIconPicker } from '@/components/loyalty/StampIconPicker';
import {
  EditorPreviewSurface,
  EditorStickyFooter,
  ManagementPageHeader,
} from '@/components/management';
import { DEFAULT_CARD_THEME_ID } from '@/constants/cardThemes';
import { DEFAULT_STAMP_ICON_ID } from '@/constants/stampIcons';
import { MAX_STAMP_OPTIONS } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  DEFAULT_LOYALTY_CARD_TERMS,
  DEFAULT_LOYALTY_REWARD_CONDITIONS,
} from '@/lib/loyalty/cardTerms';
import { loyaltyWriteErrorToHebrewMessage } from '@/lib/loyalty/programErrors';
import { rtlBaseView, tw } from '@/lib/rtl';

export default function NewLoyaltyCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessId: businessIdParam } = useLocalSearchParams<{
    businessId?: string;
  }>();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessId = (businessIdParam || activeBusinessId) as
    | Id<'businesses'>
    | undefined;
  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState(10);
  const [cardThemeId, setCardThemeId] = useState(DEFAULT_CARD_THEME_ID);
  const [stampIcon, setStampIcon] = useState(DEFAULT_STAMP_ICON_ID);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formReady =
    Boolean(businessId) &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    !isSubmitting;
  const canCreate = formReady;

  const submit = async () => {
    if (!businessId || !canCreate) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createProgram({
        businessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps,
        stampIcon,
        stampShape: 'circle',
        cardThemeId,
        cardTerms: DEFAULT_LOYALTY_CARD_TERMS,
        rewardConditions: DEFAULT_LOYALTY_REWARD_CONDITIONS,
      });
      router.replace({
        pathname: '/(authenticated)/(business)/cards/[programId]',
        params: {
          businessId: String(businessId),
          programId: String(result.loyaltyProgramId),
        },
      });
    } catch (error) {
      Alert.alert('לא הצלחנו ליצור', loyaltyWriteErrorToHebrewMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          stickyHeaderIndices={[0]}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: '100%',
            maxWidth: 720,
            alignSelf: 'center',
            paddingHorizontal: 20,
            paddingBottom: (insets.bottom || 0) + 124,
          }}
        >
          <ManagementPageHeader
            title="כרטיסייה חדשה"
            fallbackHref="/(authenticated)/(business)/programs"
          />

          <View className="mt-3">
            <EditorPreviewSurface title="כך הלקוחות יראו את הכרטיסייה">
              <LoyaltyCard
                variant="management"
                businessName={activeBusiness?.name ?? 'העסק שלך'}
                businessLogoUrl={activeBusiness?.logoUrl ?? null}
                programTitle={title || 'שם הכרטיסייה'}
                rewardName={rewardName || 'ההטבה שלך'}
                maxStamps={maxStamps}
                progress={{
                  kind: 'sample',
                  currentStamps: Math.min(3, maxStamps),
                }}
                lifecycle="draft"
                cardThemeId={cardThemeId}
                stampIcon={stampIcon}
                stampShape="circle"
              />
            </EditorPreviewSurface>
          </View>

          <View className="mt-4 gap-5 rounded-3xl border border-[#DCE6F7] bg-white p-5">
            <Text
              className={`text-lg font-black text-[#0F172A] ${tw.textStart}`}
            >
              הפרטים החשובים
            </Text>
            <View className="gap-2">
              <Text
                className={`text-sm font-bold text-[#334155] ${tw.textStart}`}
              >
                שם הכרטיסייה
              </Text>
              <TextInput
                accessibilityLabel="שם הכרטיסייה"
                value={title}
                onChangeText={setTitle}
                placeholder="למשל: מועדון הקפה"
                placeholderTextColor="#94A3B8"
                className="min-h-[50px] rounded-2xl border border-[#CBD5E1] bg-white px-4 py-3 text-right text-base text-[#0F172A]"
              />
            </View>
            <View className="gap-2">
              <Text
                className={`text-sm font-bold text-[#334155] ${tw.textStart}`}
              >
                הטבה
              </Text>
              <TextInput
                accessibilityLabel="הטבה"
                value={rewardName}
                onChangeText={setRewardName}
                placeholder="למשל: קפה מתנה"
                placeholderTextColor="#94A3B8"
                className="min-h-[50px] rounded-2xl border border-[#CBD5E1] bg-white px-4 py-3 text-right text-base text-[#0F172A]"
              />
            </View>
            <View className="gap-2">
              <Text
                className={`text-sm font-bold text-[#334155] ${tw.textStart}`}
              >
                חותמות עד ההטבה
              </Text>
              <View
                className={`${tw.flexRow} flex-wrap gap-2`}
                style={rtlBaseView}
              >
                {MAX_STAMP_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: maxStamps === option }}
                    onPress={() => setMaxStamps(option)}
                    className={`min-h-[44px] min-w-[48px] items-center justify-center rounded-xl border px-3 ${
                      maxStamps === option
                        ? 'border-[#2563EB] bg-[#DBEAFE]'
                        : 'border-[#CBD5E1] bg-white'
                    }`}
                  >
                    <Text className="font-black text-[#1E3A8A]">{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View className="mt-4 gap-5 rounded-3xl border border-[#DCE6F7] bg-white p-5">
            <View className="gap-2">
              <Text
                className={`text-base font-black text-[#0F172A] ${tw.textStart}`}
              >
                צבע הכרטיסייה
              </Text>
              <LoyaltyThemePalette
                value={cardThemeId}
                onChange={setCardThemeId}
              />
            </View>
            <View className="gap-2">
              <Text
                className={`text-base font-black text-[#0F172A] ${tw.textStart}`}
              >
                אייקון החותמת
              </Text>
              <StampIconPicker value={stampIcon} onChange={setStampIcon} />
            </View>
          </View>
        </ScrollView>
        <EditorStickyFooter>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !formReady, busy: isSubmitting }}
            disabled={!formReady}
            onPress={() => {
              void submit();
            }}
            className={`min-h-[54px] items-center justify-center rounded-2xl px-4 ${
              canCreate ? 'bg-[#2F6BFF]' : 'bg-[#94A3B8]'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-base font-black text-white">
                שמירת טיוטה
              </Text>
            )}
          </TouchableOpacity>
        </EditorStickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
