import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import { LoyaltyThemePalette } from '@/components/loyalty/LoyaltyThemePalette';
import { StampIconPicker } from '@/components/loyalty/StampIconPicker';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { CARD_THEMES, DEFAULT_CARD_THEME_ID } from '@/constants/cardThemes';
import { DEFAULT_STAMP_ICON_ID } from '@/constants/stampIcons';
import { MAX_STAMP_OPTIONS } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import {
  DEFAULT_LOYALTY_CARD_TERMS,
  DEFAULT_LOYALTY_REWARD_CONDITIONS,
} from '@/lib/loyalty/cardTerms';
import {
  isLoyaltyThemeConflict,
  LOYALTY_THEME_CONFLICT_COPY,
  loyaltyWriteErrorToHebrewMessage,
} from '@/lib/loyalty/programErrors';
import { safeBack } from '@/lib/navigation';
import { rtlBaseView, tw } from '@/lib/rtl';

type ThemeReservation = {
  programId: Id<'loyaltyPrograms'>;
  themeId: string;
  lifecycle: 'draft' | 'active';
};

function isThemeConflict(error: unknown) {
  return isLoyaltyThemeConflict(error);
}

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
  const reservations = (useQuery(
    api.loyaltyPrograms.listThemeReservationsByBusiness,
    businessId ? { businessId } : 'skip'
  ) ?? []) as ThemeReservation[];
  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);
  const { limitStatus } = useEntitlements(businessId ?? null);
  const cardLimit = limitStatus('maxCards', reservations.length);

  const usedThemeIds = useMemo(
    () => reservations.map((reservation) => reservation.themeId),
    [reservations]
  );
  const firstAvailableTheme =
    CARD_THEMES.find((theme) => !usedThemeIds.includes(theme.id))?.id ??
    DEFAULT_CARD_THEME_ID;

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState(10);
  const [cardThemeId, setCardThemeId] = useState(DEFAULT_CARD_THEME_ID);
  const [stampIcon, setStampIcon] = useState(DEFAULT_STAMP_ICON_ID);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (usedThemeIds.includes(cardThemeId)) {
      setCardThemeId(firstAvailableTheme);
    }
  }, [cardThemeId, firstAvailableTheme, usedThemeIds]);

  const noThemeAvailable = CARD_THEMES.every((theme) =>
    usedThemeIds.includes(theme.id)
  );
  const canCreate =
    Boolean(businessId) &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    !noThemeAvailable &&
    !cardLimit.isAtLimit &&
    !usedThemeIds.includes(cardThemeId) &&
    !isSubmitting;

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
      if (isThemeConflict(error)) {
        Alert.alert(
          LOYALTY_THEME_CONFLICT_COPY.create.title,
          LOYALTY_THEME_CONFLICT_COPY.create.message
        );
      } else {
        const entitlementError = getEntitlementError(error);
        Alert.alert(
          entitlementError ? 'מגבלת מסלול' : 'לא הצלחנו ליצור',
          entitlementError
            ? entitlementErrorToHebrewMessage(entitlementError)
            : loyaltyWriteErrorToHebrewMessage(error)
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 32,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="כרטיסייה חדשה"
            titleAccessory={
              <BackButton
                onPress={() => safeBack('/(authenticated)/(business)/programs')}
              />
            }
          />
        </StickyScrollHeader>

        <View className="mt-3">
          <LoyaltyCard
            variant="management"
            businessName={activeBusiness?.name ?? 'העסק שלך'}
            businessLogoUrl={activeBusiness?.logoUrl ?? null}
            programTitle={title || 'שם הכרטיסייה'}
            rewardName={rewardName || 'ההטבה שלך'}
            maxStamps={maxStamps}
            progress={{ kind: 'sample', currentStamps: Math.min(3, maxStamps) }}
            lifecycle="draft"
            cardThemeId={cardThemeId}
            stampIcon={stampIcon}
            stampShape="circle"
          />
        </View>

        <View className="mt-4 gap-5 rounded-3xl border border-[#DCE6F7] bg-white p-5">
          <Text className={`text-lg font-black text-[#0F172A] ${tw.textStart}`}>
            הפרטים החשובים
          </Text>
          <View className="gap-2">
            <Text className={`text-sm font-bold text-[#334155] ${tw.textStart}`}>
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
            <Text className={`text-sm font-bold text-[#334155] ${tw.textStart}`}>
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
            <Text className={`text-sm font-bold text-[#334155] ${tw.textStart}`}>
              חותמות עד ההטבה
            </Text>
            <View className={`${tw.flexRow} flex-wrap gap-2`} style={rtlBaseView}>
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
            <Text className={`text-base font-black text-[#0F172A] ${tw.textStart}`}>
              צבע הכרטיסייה
            </Text>
            <LoyaltyThemePalette
              value={cardThemeId}
              onChange={setCardThemeId}
              disabledThemeIds={usedThemeIds}
            />
          </View>
          <View className="gap-2">
            <Text className={`text-base font-black text-[#0F172A] ${tw.textStart}`}>
              אייקון החותמת
            </Text>
            <StampIconPicker value={stampIcon} onChange={setStampIcon} />
          </View>
        </View>

        {noThemeAvailable ? (
          <Text className="mt-4 text-right text-sm font-bold text-[#B45309]">
            כל הצבעים בשימוש. העברו כרטיסייה לארכיון כדי לפנות צבע.
          </Text>
        ) : null}
        {cardLimit.isAtLimit ? (
          <Text className="mt-4 text-right text-sm font-bold text-[#B45309]">
            הגעתם למגבלת הכרטיסיות במסלול הנוכחי.
          </Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canCreate}
          onPress={() => void submit()}
          className={`mt-5 min-h-[54px] items-center justify-center rounded-2xl px-4 ${
            canCreate ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-black text-white">
              יצירת כרטיסייה
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
