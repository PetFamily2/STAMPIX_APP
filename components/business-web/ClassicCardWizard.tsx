import { useMutation } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LoyaltyCardClassic } from '@/components/loyalty/LoyaltyCardClassic';
import { LoyaltyThemePalette } from '@/components/loyalty/LoyaltyThemePalette';
import { StampIconPicker } from '@/components/loyalty/StampIconPicker';
import { StampShapePicker } from '@/components/loyalty/StampShapePicker';
import {
  EditorStickyFooter,
  ManagementPageHeader,
} from '@/components/management';
import {
  DEFAULT_CARD_THEME_ID,
  resolveCardTheme,
} from '@/constants/cardThemes';
import {
  DEFAULT_STAMP_ICON_ID,
  resolveStampIcon,
} from '@/constants/stampIcons';
import {
  DEFAULT_STAMP_SHAPE,
  MAX_STAMP_OPTIONS,
  STAMP_SHAPE_OPTIONS,
  type StampShape,
} from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { Alert } from '@/lib/alert';
import {
  DEFAULT_LOYALTY_CARD_TERMS,
  DEFAULT_LOYALTY_REWARD_CONDITIONS,
} from '@/lib/loyalty/cardTerms';
import {
  classicWizardCanSave,
  classicWizardIssues,
} from '@/lib/loyalty/classicWizard';
import { loyaltyWriteErrorToHebrewMessage } from '@/lib/loyalty/programErrors';
import { businessHref } from '@/lib/navigation/businessHref';
import { rtlBaseView, tw, justifyContent } from '@/lib/rtl';

const STEPS = [
  { id: 1, label: 'פרטים' },
  { id: 2, label: 'עיצוב' },
  { id: 3, label: 'שמירה' },
] as const;

export function ClassicCardWizard() {
  const router = useRouter();
  const { businessId: businessIdParam } = useLocalSearchParams<{
    businessId?: string;
  }>();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessId = (businessIdParam || activeBusinessId) as
    | Id<'businesses'>
    | undefined;
  const createProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [designPanel, setDesignPanel] = useState<
    'theme' | 'icon' | 'shape' | null
  >(null);
  const [showIssues, setShowIssues] = useState(false);
  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState(10);
  const [cardThemeId, setCardThemeId] = useState(DEFAULT_CARD_THEME_ID);
  const [stampIcon, setStampIcon] = useState(DEFAULT_STAMP_ICON_ID);
  const [stampShape, setStampShape] = useState<StampShape>(DEFAULT_STAMP_SHAPE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);

  const draft = {
    title,
    rewardName,
    maxStamps,
    cardThemeId,
    stampIcon,
    stampShape,
  };
  const issues = classicWizardIssues(draft);
  const stepIssues = issues.filter((issue) =>
    step === 1
      ? issue.field !== 'cardThemeId'
      : step === 2
        ? issue.field === 'cardThemeId'
        : true
  );
  const visibleIssues = showIssues ? stepIssues : [];
  const theme = resolveCardTheme(cardThemeId);
  const icon = resolveStampIcon(stampIcon);
  const shapeLabel =
    STAMP_SHAPE_OPTIONS.find((option) => option.id === stampShape)?.label ??
    stampShape;

  const goNext = () => {
    if (stepIssues.length > 0) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    setStep((current) => (current < 3 ? ((current + 1) as 2 | 3) : current));
  };

  const submit = async () => {
    if (!businessId || submitLock.current || !classicWizardCanSave(draft)) {
      setShowIssues(true);
      return;
    }
    submitLock.current = true;
    setIsSubmitting(true);
    try {
      const result = await createProgram({
        businessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps,
        stampIcon,
        stampShape,
        cardThemeId,
        cardTerms: DEFAULT_LOYALTY_CARD_TERMS,
        rewardConditions: DEFAULT_LOYALTY_REWARD_CONDITIONS,
      });
      router.replace({
        pathname: businessHref(
          Platform.OS,
          '/(authenticated)/(business)/cards/[programId]'
        ) as never,
        params: {
          businessId: String(businessId),
          programId: String(result.loyaltyProgramId),
        },
      });
    } catch (error) {
      submitLock.current = false;
      setIsSubmitting(false);
      Alert.alert('לא הצלחנו ליצור', loyaltyWriteErrorToHebrewMessage(error));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F3F5F9]"
      style={{ flex: 1 }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
          flex: 1,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        <ManagementPageHeader
          title="כרטיסייה חדשה"
          fallbackHref="/(authenticated)/(business)/programs"
        />
        <View
          accessibilityRole="tablist"
          className={`${tw.flexRow} mt-3 gap-2`}
          style={rtlBaseView}
        >
          {STEPS.map((item) => {
            const selected = step === item.id;
            return (
              <View
                accessibilityState={{ selected }}
                key={item.id}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-2xl border px-2 ${
                  selected
                    ? 'border-[#1C1917] bg-[#1C1917]'
                    : 'border-[#D6CBBA] bg-white'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${selected ? 'text-white' : 'text-[#44403C]'}`}
                >
                  {item.id}. {item.label}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="mt-4">
          <Text className={`text-sm font-bold text-[#78350F] ${tw.textStart}`}>
            תצוגה לדוגמה. זו לא התקדמות של לקוח.
          </Text>
          <View className="mt-2">
            <LoyaltyCardClassic
              businessLogoUrl={activeBusiness?.logoUrl ?? null}
              businessName={activeBusiness?.name ?? 'העסק שלך'}
              cardThemeId={cardThemeId}
              density="compact"
              lifecycle="draft"
              maxStamps={maxStamps}
              programTitle={title.trim() || 'שם הכרטיסייה'}
              progress={{
                kind: 'sample',
                currentStamps: Math.min(3, maxStamps),
              }}
              rewardName={rewardName.trim() || 'ההטבה'}
              stampIcon={stampIcon}
              stampShape={stampShape}
              variant="preview"
            />
          </View>
        </View>

        {visibleIssues.length > 0 ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            className="mt-4 gap-1 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4"
          >
            {visibleIssues.map((issue) => (
              <Text
                className={`text-sm font-bold text-[#7F1D1D] ${tw.textStart}`}
                key={issue.field}
              >
                {issue.message}
              </Text>
            ))}
          </View>
        ) : null}

        {step === 1 ? (
          <View className="mt-4 gap-5 rounded-3xl border border-[#D6CBBA] bg-white p-5">
            <Field
              label="שם הכרטיסייה"
              onChange={setTitle}
              placeholder="למשל: כרטיס בוקר"
              value={title}
            />
            <Field
              label="הטבה"
              onChange={setRewardName}
              placeholder="למשל: קפה פילטר על הבית"
              value={rewardName}
            />
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: maxStamps === option }}
                    key={option}
                    onPress={() => setMaxStamps(option)}
                    className={`min-h-[44px] min-w-[48px] items-center justify-center rounded-xl border px-3 ${
                      maxStamps === option
                        ? 'border-[#1C1917] bg-[#1C1917]'
                        : 'border-[#D6CBBA] bg-white'
                    }`}
                  >
                    <Text
                      className={`font-black ${maxStamps === option ? 'text-white' : 'text-[#1C1917]'}`}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View className="mt-3 gap-2">
            {(
              [
                ['theme', 'צבע', theme.name],
                ['icon', 'אייקון', icon.label],
                ['shape', 'צורה', shapeLabel],
              ] as const
            ).map(([id, label, value]) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={id}
                onPress={() => setDesignPanel(id)}
                className="min-h-[44px] justify-center rounded-xl border border-[#D5DBE6] bg-white px-3"
              >
                <Text
                  className={`text-sm font-semibold text-[#101936] ${tw.textStart}`}
                >
                  {label}: {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View className="mt-4 gap-3 rounded-3xl border border-[#D6CBBA] bg-white p-5">
            <Text
              className={`text-lg font-black text-[#1C1917] ${tw.textStart}`}
            >
              סיכום לפני שמירת טיוטה
            </Text>
            <Summary label="כרטיסייה" value={title.trim() || '—'} />
            <Summary label="הטבה" value={rewardName.trim() || '—'} />
            <Summary label="חותמות" value={String(maxStamps)} />
            <Summary label="צבע" value={theme.name} />
            <Summary label="אייקון" value={icon.label} />
            <Summary label="צורה" value={shapeLabel} />
            <Text className={`text-sm text-[#57534E] ${tw.textStart}`}>
              השמירה יוצרת טיוטה. הכרטיסייה לא מתפרסמת לבד. תנאי הכרטיס נשארים
              ברירת המחדל, ואפשר לערוך אותם אחר כך.
            </Text>
          </View>
        ) : null}
      </View>
      <Modal
        animationType="slide"
        onRequestClose={() => setDesignPanel(null)}
        transparent={true}
        visible={designPanel !== null}
      >
        <View
          className="flex-1 bg-black/40"
          style={{ justifyContent: justifyContent.start }}
        >
          <View className="max-h-[70%] rounded-t-2xl bg-white p-4">
            <Text
              className={`mb-3 text-base font-semibold text-[#101936] ${tw.textStart}`}
            >
              {designPanel === 'theme'
                ? 'צבע הכרטיסייה'
                : designPanel === 'icon'
                  ? 'אייקון החותמת'
                  : 'צורת החותמת'}
            </Text>
            <View className="max-h-[420px]">
              {designPanel === 'theme' ? (
                <LoyaltyThemePalette
                  onChange={setCardThemeId}
                  value={cardThemeId}
                />
              ) : null}
              {designPanel === 'icon' ? (
                <StampIconPicker onChange={setStampIcon} value={stampIcon} />
              ) : null}
              {designPanel === 'shape' ? (
                <StampShapePicker
                  onChange={setStampShape}
                  stampIcon={stampIcon}
                  value={stampShape}
                />
              ) : null}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              className="mt-3 min-h-[44px] items-center justify-center rounded-xl bg-[#1230A8]"
              onPress={() => setDesignPanel(null)}
            >
              <Text className="font-semibold text-white">סגירה</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <EditorStickyFooter>
        <View className={`${tw.flexRow} gap-2`} style={rtlBaseView}>
          {step > 1 ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                setShowIssues(false);
                setStep((current) =>
                  current > 1 ? ((current - 1) as 1 | 2) : current
                );
              }}
              className="min-h-[54px] flex-1 items-center justify-center rounded-2xl border border-[#D6CBBA] bg-white px-4"
            >
              <Text className="text-base font-black text-[#1C1917]">חזרה</Text>
            </TouchableOpacity>
          ) : null}
          {step < 3 ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={goNext}
              className="min-h-[54px] flex-1 items-center justify-center rounded-2xl bg-[#1C1917] px-4"
            >
              <Text className="text-base font-black text-white">המשך</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{
                disabled: isSubmitting || !businessId,
                busy: isSubmitting,
              }}
              disabled={isSubmitting || !businessId}
              onPress={() => {
                void submit();
              }}
              className={`min-h-[54px] flex-1 items-center justify-center rounded-2xl px-4 ${
                isSubmitting || !businessId ? 'bg-[#A8A29E]' : 'bg-[#1C1917]'
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
          )}
        </View>
      </EditorStickyFooter>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View className="gap-2">
      <Text className={`text-sm font-bold text-[#334155] ${tw.textStart}`}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        value={value}
        className="min-h-[50px] rounded-2xl border border-[#D6CBBA] bg-white px-4 py-3 text-right text-base text-[#1C1917]"
      />
    </View>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Text className={`text-base text-[#1C1917] ${tw.textStart}`}>
      <Text className="font-bold">{label}: </Text>
      {value}
    </Text>
  );
}
