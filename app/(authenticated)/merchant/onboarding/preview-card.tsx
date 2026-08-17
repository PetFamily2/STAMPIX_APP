import { useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContinueButton } from '@/components/ContinueButton';
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { resolveCardTheme } from '@/constants/cardThemes';
import { useAppMode } from '@/contexts/AppModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { alignItems, flexDirection, justifyContent } from '@/lib/rtl';

const TEXT = {
  title: 'תצוגה מקדימה לכרטיס',
  subtitle: 'בחרו את העיצוב שמרגיש הכי מדויק למותג שלכם.',
  progressLabel: 'התקדמות לדוגמה',
  feelLabel: 'אופי הכרטיס',
  themeSectionTitle: '5 עיצובים לבחירה',
  themeSectionSubtitle: 'לחצו על סגנון כדי לראות את הכרטיס מתחלף מיד.',
  continue: 'סיום ופתיחת סורק',
  submitting: 'משלימים הגדרות',
  fallbackBusinessName: 'עסק חדש',
  fallbackReward: 'מתנה שתרצו להעניק ללקוחות',
  errorTitle: 'שגיאה',
  errorMessage: 'לא הצלחנו להשלים את האונבורדינג העסקי. נסו שוב.',
  activeBusinessError:
    'לא הצלחנו לבחור את העסק הפעיל. נסו שוב לפני המעבר לניהול העסק.',
  profileIncompleteMessage:
    'חסרים פרטים בפרופיל העסק. חזרו לשלב פרטי העסק והשלימו את השדות הנדרשים לפני פרסום.',
  selected: 'נבחר',
};

type CardTheme = {
  id: string;
  name: string;
  vibe: string;
  selectorHint: string;
};

const PREVIEW_COPY = {
  title: 'בדיקה אחרונה לפני פרסום',
  subtitle: 'כך הכרטיסייה תיראה ללקוחות באפליקציה.',
  publishNote: 'נפרסם את הכרטיסייה הראשונה שלך ונעביר אותך לניהול העסק.',
  referralNote: 'אפשר להפעיל חבר מביא חבר בהגדרות העסק.',
  continue: 'פרסום וכניסה לניהול',
};

const CARD_THEMES: CardTheme[] = [
  {
    id: 'midnight-luxe',
    name: 'יוקרתי כהה',
    vibe: 'עמוק, אלגנטי ובולט',
    selectorHint: 'לעסק שרוצה תחושה יוקרתית ומוקפדת',
  },
  {
    id: 'sunset-pop',
    name: 'שקיעה חמימה',
    vibe: 'חם, מזמין וחברתי',
    selectorHint: 'לעסק פעיל עם הרבה תנועה ואנרגיה',
  },
  {
    id: 'forest-club',
    name: 'ירוק טבעי',
    vibe: 'רענן, רגוע וטבעי',
    selectorHint: 'מתאים לעסקי אוכל, בריאות וטיפוח',
  },
  {
    id: 'champagne-blush',
    name: 'בוטיק עדין',
    vibe: 'אלגנטי, רך ובוטיקי',
    selectorHint: 'לעסק שרוצה מראה נקי ועדין',
  },
  {
    id: 'electric-wave',
    name: 'גל מודרני',
    vibe: 'נועז, צעיר ומודרני',
    selectorHint: 'לעסק שרוצה להרגיש קליל ודינמי',
  },
];

const PREVIEW_FILLED_STAMPS = 3;

function ThemeOption({
  theme,
  selected,
  onPress,
}: {
  theme: CardTheme;
  selected: boolean;
  onPress: () => void;
}) {
  const sharedTheme = resolveCardTheme(theme.id);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.themeOption,
        { backgroundColor: sharedTheme.isLight ? '#FFFBF7' : '#F8FAFC' },
        selected
          ? { borderColor: sharedTheme.accent }
          : styles.themeOptionIdle,
        pressed ? styles.themeOptionPressed : null,
      ]}
    >
      <View
        style={[
          styles.themeSwatch,
          { backgroundColor: sharedTheme.surface },
        ]}
      >
        <View
          style={[
            styles.themeSwatchLine,
            { backgroundColor: sharedTheme.accent },
          ]}
        />
      </View>

      <View style={styles.themeTextBlock}>
        <View style={styles.themeTitleRow}>
          {selected ? (
            <View
              style={[
                styles.selectedBadge,
                { backgroundColor: sharedTheme.accent },
              ]}
            >
              <Text style={styles.selectedBadgeText}>{TEXT.selected}</Text>
            </View>
          ) : null}
          <Text style={[styles.themeName, { color: '#0F172A' }]}>
            {theme.name}
          </Text>
        </View>
        <Text style={[styles.themeVibe, { color: '#475569' }]}>
          {theme.vibe}
        </Text>
        <Text style={[styles.themeHint, { color: '#64748B' }]}>
          {theme.selectorHint}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PreviewCardScreen() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const {
    businessDraft,
    businessOnboardingDraft,
    programDraft,
    setProgramDraft,
    businessId,
    programId,
    reset,
  } = useOnboarding();
  const completeBusinessOnboarding = useMutation(
    api.users.completeBusinessOnboarding
  );
  const updateProgramForManagement = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );
  const publishProgram = useMutation(api.loyaltyPrograms.publishProgram);
  const saveBusinessOnboardingSnapshot = useMutation(
    api.business.saveBusinessOnboardingSnapshot
  );
  const assertBusinessOnboardingReady = useMutation(
    api.business.assertBusinessOnboardingReady
  );
  const setActiveBusiness = useMutation(api.users.setActiveBusiness);
  const setActiveMode = useMutation(api.users.setActiveMode);
  const { setAppMode } = useAppMode();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);

  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'previewCard', flow }).catch(() => {});
  }, [flow, saveStep]);

  useEffect(() => {
    if (!businessId) {
      safePush(
        withBusinessOnboardingFlow(
          BUSINESS_ONBOARDING_ROUTES.createBusiness,
          flow
        )
      );
      return;
    }

    if (!programId) {
      safePush(
        withBusinessOnboardingFlow(
          BUSINESS_ONBOARDING_ROUTES.createProgram,
          flow
        )
      );
    }
  }, [businessId, flow, programId]);

  const stampCount = useMemo(() => {
    const parsed = Number(programDraft.maxStamps);
    return parsed > 0 ? parsed : 1;
  }, [programDraft.maxStamps]);

  const rewardValue = programDraft.rewardName.trim();
  const businessName = businessDraft.name.trim() || TEXT.fallbackBusinessName;
  const completedPreviewStamps = Math.min(PREVIEW_FILLED_STAMPS, stampCount);

  const selectedTheme = useMemo(
    () =>
      CARD_THEMES.find((theme) => theme.id === programDraft.cardThemeId) ??
      CARD_THEMES[0],
    [programDraft.cardThemeId]
  );

  const handleThemeSelect = (themeId: string) => {
    setProgramDraft((prev) =>
      prev.cardThemeId === themeId ? prev : { ...prev, cardThemeId: themeId }
    );
  };

  const handleFinish = async () => {
    if (!businessId || !programId || isFinishing) {
      return;
    }

    setIsFinishing(true);
    try {
      await saveBusinessOnboardingSnapshot({
        businessId,
        discoverySource: businessOnboardingDraft.discoverySource ?? undefined,
        reason: businessOnboardingDraft.reason ?? undefined,
        usageAreas:
          businessOnboardingDraft.usageAreas.length > 0
            ? businessOnboardingDraft.usageAreas
            : undefined,
        ownerAgeRange: businessOnboardingDraft.ageRange ?? undefined,
        businessExample: businessOnboardingDraft.businessExample ?? undefined,
        cadenceBand: businessOnboardingDraft.cadenceBand ?? undefined,
        birthdayCampaignRelevant:
          businessOnboardingDraft.birthdayCampaignRelevant ?? undefined,
        joinAnniversaryCampaignRelevant:
          businessOnboardingDraft.joinAnniversaryCampaignRelevant ?? undefined,
        weakTimePromosRelevant:
          businessOnboardingDraft.weakTimePromosRelevant ?? undefined,
      });

      await assertBusinessOnboardingReady({ businessId });

      const normalizedTitle =
        programDraft.title.trim() || programDraft.rewardName.trim();
      const normalizedReward =
        programDraft.rewardName.trim() || programDraft.title.trim();

      await updateProgramForManagement({
        businessId,
        programId,
        title: normalizedTitle,
        description: undefined,
        imageUrl: undefined,
        imageStorageId: programDraft.imageStorageId ?? undefined,
        rewardName: normalizedReward,
        maxStamps: stampCount,
        cardTerms: programDraft.cardTerms.trim() || undefined,
        rewardConditions: programDraft.rewardConditions.trim() || undefined,
        stampIcon: programDraft.stampIcon.trim() || 'star',
        stampShape: programDraft.stampShape,
        cardThemeId: programDraft.cardThemeId,
      });

      await publishProgram({
        businessId,
        programId,
      });

      await completeBusinessOnboarding({ businessId });
      await setActiveBusiness({ businessId });
      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      try {
        await saveStep({
          step: 'previewCard',
          flow,
          status: 'completed',
        });
      } catch {
        // Completion should continue even if draft status update fails.
      }
      reset();
      safePush('/(authenticated)/(business)/dashboard');
    } catch (finishError) {
      const message =
        finishError instanceof Error &&
        finishError.message.includes('BUSINESS_PROFILE_INCOMPLETE')
          ? TEXT.profileIncompleteMessage
          : finishError instanceof Error &&
              finishError.message.includes('BUSINESS_NOT_AVAILABLE')
            ? TEXT.activeBusinessError
            : TEXT.errorMessage;
      Alert.alert(TEXT.errorTitle, message);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ScrollView
          stickyHeaderIndices={[0]}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <StickyScrollHeader
            topPadding={0}
            backgroundColor="#F4F0E8"
            style={styles.titleContainer}
          >
            <StandaloneBackTitleHeader
              title={PREVIEW_COPY.title}
              subtitle={PREVIEW_COPY.subtitle}
              onBackPress={() =>
                safeDismissTo(
                  withBusinessOnboardingFlow(
                    BUSINESS_ONBOARDING_ROUTES.createProgram,
                    flow
                  )
                )
              }
              leftAccessory={
                <OnboardingProgress
                  total={getBusinessOnboardingTotalSteps(flow)}
                  current={getBusinessOnboardingProgressStep(
                    'previewCard',
                    flow
                  )}
                />
              }
              style={styles.header}
              titleStyle={styles.title}
              subtitleStyle={styles.subtitle}
            />
          </StickyScrollHeader>

          <View style={styles.previewShell}>
            <LoyaltyCard
              variant="preview"
              businessName={businessName}
              businessLogoUrl={businessDraft.logoUrl}
              programImageUrl={programDraft.imagePreviewUri}
              programTitle={
                programDraft.title.trim() || rewardValue || TEXT.fallbackReward
              }
              rewardName={rewardValue || TEXT.fallbackReward}
              maxStamps={stampCount}
              progress={{
                kind: 'sample',
                currentStamps: completedPreviewStamps,
              }}
              lifecycle="draft"
              cardThemeId={programDraft.cardThemeId}
              stampIcon={programDraft.stampIcon}
              stampShape={programDraft.stampShape}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{TEXT.themeSectionTitle}</Text>
            <Text style={styles.sectionSubtitle}>
              {TEXT.themeSectionSubtitle}
            </Text>

            <View style={styles.themeOptions}>
              {CARD_THEMES.map((theme) => (
                <ThemeOption
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === selectedTheme.id}
                  onPress={() => handleThemeSelect(theme.id)}
                />
              ))}
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryNote}>{PREVIEW_COPY.publishNote}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>{selectedTheme.name}</Text>
              <Text style={styles.summaryLabel}>{TEXT.feelLabel}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>
                {completedPreviewStamps}/{stampCount}
              </Text>
              <Text style={styles.summaryLabel}>{TEXT.progressLabel}</Text>
            </View>
            <Text style={styles.summaryNoteMuted}>
              {PREVIEW_COPY.referralNote}
            </Text>
          </View>

          {isFinishing ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.submittingText}>{TEXT.submitting}</Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <ContinueButton
              onPress={() => {
                void handleFinish();
              }}
              disabled={!businessId || !programId || isFinishing}
              label={PREVIEW_COPY.continue}
            />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F0E8',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 28,
    gap: 18,
  },
  titleContainer: {
    alignItems: alignItems.start,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#57534E',
    textAlign: 'right',
  },
  previewShell: {
    borderRadius: 28,
  },
  sectionCard: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    padding: 18,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },
  themeOptions: {
    gap: 12,
  },
  themeOption: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
  },
  themeOptionIdle: {
    borderColor: '#E5E7EB',
  },
  themeOptionPressed: {
    opacity: 0.92,
  },
  themeSwatch: {
    width: 68,
    height: 68,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeSwatchLine: {
    width: 34,
    height: 8,
    borderRadius: 999,
    transform: [{ rotate: '-34deg' }],
  },
  themeTextBlock: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 4,
  },
  themeTitleRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0F172A',
  },
  themeName: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  themeVibe: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
  },
  themeHint: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'right',
  },
  summaryCard: {
    borderRadius: 22,
    backgroundColor: '#131A2A',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  summaryNote: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryNoteMuted: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#9FB0C9',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9FB0C9',
    textAlign: 'right',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  submittingRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: justifyContent.start,
    gap: 8,
  },
  submittingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'right',
  },
  footer: {
    marginTop: 4,
  },
});
