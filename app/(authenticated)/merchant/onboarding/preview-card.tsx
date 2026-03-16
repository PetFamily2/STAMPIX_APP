import { useMutation } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
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

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useAppMode } from '@/contexts/AppModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  title: 'תצוגה מקדימה לכרטיס',
  subtitle: 'בחרו את העיצוב שמרגיש הכי מדויק למותג שלכם.',
  rewardLabel: 'הטבה',
  stampsLabel: 'מספר ניקובים',
  progressLabel: 'התקדמות לדוגמה',
  feelLabel: 'אופי הכרטיס',
  themeSectionTitle: '5 עיצובים לבחירה',
  themeSectionSubtitle: 'לחצו על סגנון כדי לראות את הכרטיס מתחלף מיד.',
  livePreview: 'LIVE PREVIEW',
  continue: 'סיום ופתיחת סורק',
  submitting: 'משלימים הגדרות',
  fallbackBusinessName: 'עסק חדש',
  fallbackReward: 'מתנה שתרצו להעניק ללקוחות',
  errorTitle: 'שגיאה',
  errorMessage: 'לא הצלחנו להשלים את האונבורדינג העסקי. נסו שוב.',
  selected: 'נבחר',
};

type CardTheme = {
  id: string;
  name: string;
  vibe: string;
  selectorHint: string;
  gradient: readonly [string, string, string];
  glow: string;
  glowSoft: string;
  rim: string;
  badgeBg: string;
  badgeText: string;
  titleColor: string;
  subtitleColor: string;
  rewardBg: string;
  rewardBorder: string;
  rewardText: string;
  rewardFallback: string;
  stampFilledBg: string;
  stampFilledBorder: string;
  stampFilledText: string;
  stampEmptyBg: string;
  stampEmptyBorder: string;
  stampEmptyText: string;
  metricBg: string;
  metricBorder: string;
  metricLabel: string;
  metricValue: string;
  selectorSurface: string;
  selectorBorder: string;
  selectorTitle: string;
  selectorSubtitle: string;
  shadowColor: string;
};

const CARD_THEMES: CardTheme[] = [
  {
    id: 'midnight-luxe',
    name: 'Midnight Luxe',
    vibe: 'Premium, dramatic and rich',
    selectorHint: 'For a refined premium feel',
    gradient: ['#0F172A', '#1D4ED8', '#312E81'],
    glow: 'rgba(255,255,255,0.12)',
    glowSoft: 'rgba(147,197,253,0.24)',
    rim: 'rgba(191,219,254,0.34)',
    badgeBg: 'rgba(255,255,255,0.16)',
    badgeText: '#DBEAFE',
    titleColor: '#F8FAFC',
    subtitleColor: '#D6E6FF',
    rewardBg: 'rgba(15,23,42,0.28)',
    rewardBorder: 'rgba(191,219,254,0.32)',
    rewardText: '#FFFFFF',
    rewardFallback: '#D6E6FF',
    stampFilledBg: '#F8FAFC',
    stampFilledBorder: '#DBEAFE',
    stampFilledText: '#1D4ED8',
    stampEmptyBg: 'rgba(255,255,255,0.08)',
    stampEmptyBorder: 'rgba(219,234,254,0.24)',
    stampEmptyText: '#D6E6FF',
    metricBg: 'rgba(255,255,255,0.12)',
    metricBorder: 'rgba(219,234,254,0.2)',
    metricLabel: '#DBEAFE',
    metricValue: '#FFFFFF',
    selectorSurface: '#F8FBFF',
    selectorBorder: '#9CC0FF',
    selectorTitle: '#0F172A',
    selectorSubtitle: '#4B5563',
    shadowColor: '#1D4ED8',
  },
  {
    id: 'sunset-pop',
    name: 'Sunset Pop',
    vibe: 'Warm, inviting and social',
    selectorHint: 'Strong energy for busy places',
    gradient: ['#7C2D12', '#EA580C', '#FDBA74'],
    glow: 'rgba(255,255,255,0.16)',
    glowSoft: 'rgba(255,237,213,0.34)',
    rim: 'rgba(255,237,213,0.38)',
    badgeBg: 'rgba(255,255,255,0.18)',
    badgeText: '#FFF7ED',
    titleColor: '#FFF7ED',
    subtitleColor: '#FFEDD5',
    rewardBg: 'rgba(255,247,237,0.16)',
    rewardBorder: 'rgba(255,237,213,0.36)',
    rewardText: '#FFF7ED',
    rewardFallback: '#FFEDD5',
    stampFilledBg: '#FFF7ED',
    stampFilledBorder: '#FFEDD5',
    stampFilledText: '#C2410C',
    stampEmptyBg: 'rgba(255,247,237,0.08)',
    stampEmptyBorder: 'rgba(255,237,213,0.28)',
    stampEmptyText: '#FFEDD5',
    metricBg: 'rgba(255,255,255,0.14)',
    metricBorder: 'rgba(255,237,213,0.26)',
    metricLabel: '#FFEDD5',
    metricValue: '#FFF7ED',
    selectorSurface: '#FFF7ED',
    selectorBorder: '#FDBA74',
    selectorTitle: '#7C2D12',
    selectorSubtitle: '#7C3A1D',
    shadowColor: '#EA580C',
  },
  {
    id: 'forest-club',
    name: 'Forest Club',
    vibe: 'Fresh, calm and natural',
    selectorHint: 'Ideal for wellness and food',
    gradient: ['#052E16', '#15803D', '#86EFAC'],
    glow: 'rgba(255,255,255,0.12)',
    glowSoft: 'rgba(220,252,231,0.28)',
    rim: 'rgba(220,252,231,0.28)',
    badgeBg: 'rgba(255,255,255,0.14)',
    badgeText: '#DCFCE7',
    titleColor: '#F0FDF4',
    subtitleColor: '#DCFCE7',
    rewardBg: 'rgba(5,46,22,0.24)',
    rewardBorder: 'rgba(220,252,231,0.26)',
    rewardText: '#F0FDF4',
    rewardFallback: '#DCFCE7',
    stampFilledBg: '#F0FDF4',
    stampFilledBorder: '#DCFCE7',
    stampFilledText: '#15803D',
    stampEmptyBg: 'rgba(240,253,244,0.08)',
    stampEmptyBorder: 'rgba(220,252,231,0.24)',
    stampEmptyText: '#DCFCE7',
    metricBg: 'rgba(255,255,255,0.12)',
    metricBorder: 'rgba(220,252,231,0.22)',
    metricLabel: '#DCFCE7',
    metricValue: '#F0FDF4',
    selectorSurface: '#F0FDF4',
    selectorBorder: '#86EFAC',
    selectorTitle: '#052E16',
    selectorSubtitle: '#3F3F46',
    shadowColor: '#15803D',
  },
  {
    id: 'champagne-blush',
    name: 'Champagne Blush',
    vibe: 'Elegant, soft and boutique',
    selectorHint: 'Soft luxury without heaviness',
    gradient: ['#FFF7ED', '#FCE7F3', '#FED7AA'],
    glow: 'rgba(255,255,255,0.58)',
    glowSoft: 'rgba(251,207,232,0.34)',
    rim: 'rgba(255,255,255,0.5)',
    badgeBg: 'rgba(255,255,255,0.62)',
    badgeText: '#9D174D',
    titleColor: '#431407',
    subtitleColor: '#7C2D12',
    rewardBg: 'rgba(255,255,255,0.68)',
    rewardBorder: 'rgba(251,207,232,0.72)',
    rewardText: '#4A044E',
    rewardFallback: '#A16207',
    stampFilledBg: '#4A044E',
    stampFilledBorder: '#701A75',
    stampFilledText: '#FFFFFF',
    stampEmptyBg: 'rgba(255,255,255,0.64)',
    stampEmptyBorder: 'rgba(251,207,232,0.76)',
    stampEmptyText: '#9D174D',
    metricBg: 'rgba(255,255,255,0.64)',
    metricBorder: 'rgba(255,255,255,0.8)',
    metricLabel: '#9D174D',
    metricValue: '#431407',
    selectorSurface: '#FFFBF7',
    selectorBorder: '#FBCFE8',
    selectorTitle: '#431407',
    selectorSubtitle: '#7C2D12',
    shadowColor: '#FDBA74',
  },
  {
    id: 'electric-wave',
    name: 'Electric Wave',
    vibe: 'Bold, playful and modern',
    selectorHint: 'For younger and fast brands',
    gradient: ['#082F49', '#0891B2', '#67E8F9'],
    glow: 'rgba(255,255,255,0.12)',
    glowSoft: 'rgba(165,243,252,0.32)',
    rim: 'rgba(207,250,254,0.34)',
    badgeBg: 'rgba(255,255,255,0.16)',
    badgeText: '#CFFAFE',
    titleColor: '#ECFEFF',
    subtitleColor: '#CFFAFE',
    rewardBg: 'rgba(8,47,73,0.22)',
    rewardBorder: 'rgba(165,243,252,0.28)',
    rewardText: '#ECFEFF',
    rewardFallback: '#CFFAFE',
    stampFilledBg: '#ECFEFF',
    stampFilledBorder: '#CFFAFE',
    stampFilledText: '#0E7490',
    stampEmptyBg: 'rgba(236,254,255,0.08)',
    stampEmptyBorder: 'rgba(207,250,254,0.24)',
    stampEmptyText: '#CFFAFE',
    metricBg: 'rgba(255,255,255,0.12)',
    metricBorder: 'rgba(207,250,254,0.22)',
    metricLabel: '#CFFAFE',
    metricValue: '#ECFEFF',
    selectorSurface: '#F0FDFF',
    selectorBorder: '#67E8F9',
    selectorTitle: '#082F49',
    selectorSubtitle: '#155E75',
    shadowColor: '#0891B2',
  },
];

const PREVIEW_FILLED_STAMPS = 3;
const MAX_STAMPS_PER_ROW = 5;

function ThemeOption({
  theme,
  selected,
  onPress,
}: {
  theme: CardTheme;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.themeOption,
        { backgroundColor: theme.selectorSurface },
        selected
          ? { borderColor: theme.selectorBorder }
          : styles.themeOptionIdle,
        pressed ? styles.themeOptionPressed : null,
      ]}
    >
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.themeSwatch}
      >
        <View
          style={[styles.themeSwatchOrb, { backgroundColor: theme.glowSoft }]}
        />
        <View
          style={[styles.themeSwatchLine, { backgroundColor: theme.rim }]}
        />
      </LinearGradient>

      <View style={styles.themeTextBlock}>
        <View style={styles.themeTitleRow}>
          {selected ? (
            <View
              style={[
                styles.selectedBadge,
                { backgroundColor: theme.selectorBorder },
              ]}
            >
              <Text style={styles.selectedBadgeText}>{TEXT.selected}</Text>
            </View>
          ) : null}
          <Text style={[styles.themeName, { color: theme.selectorTitle }]}>
            {theme.name}
          </Text>
        </View>
        <Text style={[styles.themeVibe, { color: theme.selectorSubtitle }]}>
          {theme.vibe}
        </Text>
        <Text style={[styles.themeHint, { color: theme.selectorSubtitle }]}>
          {theme.selectorHint}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PreviewCardScreen() {
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
  const setActiveMode = useMutation(api.users.setActiveMode);
  const { setAppMode } = useAppMode();

  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (!businessId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
      return;
    }

    if (!programId) {
      safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
    }
  }, [businessId, programId]);

  const stampCount = useMemo(() => {
    const parsed = Number(programDraft.maxStamps);
    return parsed > 0 ? parsed : 1;
  }, [programDraft.maxStamps]);

  const stampLabel = useMemo(() => {
    const value = programDraft.stampIcon?.trim();
    if (value && value.length > 0) {
      return value.charAt(0).toUpperCase();
    }
    return '*';
  }, [programDraft.stampIcon]);

  const stampSlots = useMemo(
    () => Array.from({ length: stampCount }, (_, index) => index + 1),
    [stampCount]
  );

  const stampRows = useMemo(() => {
    if (stampSlots.length <= MAX_STAMPS_PER_ROW) {
      return [stampSlots];
    }

    if (stampSlots.length <= MAX_STAMPS_PER_ROW * 2) {
      const firstRowCount = Math.ceil(stampSlots.length / 2);
      return [
        stampSlots.slice(0, firstRowCount),
        stampSlots.slice(firstRowCount),
      ];
    }

    const rows: number[][] = [];
    for (
      let index = 0;
      index < stampSlots.length;
      index += MAX_STAMPS_PER_ROW
    ) {
      rows.push(stampSlots.slice(index, index + MAX_STAMPS_PER_ROW));
    }
    return rows;
  }, [stampSlots]);

  const rewardValue = programDraft.rewardName.trim();
  const isFallbackReward = rewardValue.length === 0;
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
        rewardName: normalizedReward,
        maxStamps: stampCount,
        cardTerms: undefined,
        rewardConditions: undefined,
        stampIcon: programDraft.stampIcon.trim() || 'star',
        cardThemeId: programDraft.cardThemeId,
      });

      await publishProgram({
        businessId,
        programId,
      });

      await saveBusinessOnboardingSnapshot({
        businessId,
        discoverySource: businessOnboardingDraft.discoverySource ?? undefined,
        reason: businessOnboardingDraft.reason ?? undefined,
        usageAreas:
          businessOnboardingDraft.usageAreas.length > 0
            ? businessOnboardingDraft.usageAreas
            : undefined,
        ownerAgeRange: businessOnboardingDraft.ageRange ?? undefined,
      });
      await completeBusinessOnboarding({});
      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      reset();
      safePush('/(authenticated)/(business)/scanner');
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.errorMessage);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.createProgram)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.previewCard}
          />
        </View>

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
            <Text style={styles.title}>{TEXT.title}</Text>
            <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
          </StickyScrollHeader>

          <View style={styles.previewShell}>
            <LinearGradient
              colors={selectedTheme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.previewCard,
                { shadowColor: selectedTheme.shadowColor },
              ]}
            >
              <View
                style={[
                  styles.previewGlowLarge,
                  { backgroundColor: selectedTheme.glow },
                ]}
              />
              <View
                style={[
                  styles.previewGlowSmall,
                  { backgroundColor: selectedTheme.glowSoft },
                ]}
              />
              <View
                style={[styles.previewRing, { borderColor: selectedTheme.rim }]}
              />

              <View style={styles.previewHeaderRow}>
                <View
                  style={[
                    styles.previewBadge,
                    { backgroundColor: selectedTheme.badgeBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewBadgeText,
                      { color: selectedTheme.badgeText },
                    ]}
                  >
                    {TEXT.livePreview}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.previewBusinessName,
                    { color: selectedTheme.titleColor },
                  ]}
                >
                  {businessName}
                </Text>
              </View>

              <View style={styles.previewHero}>
                <Text
                  style={[
                    styles.previewThemeName,
                    { color: selectedTheme.titleColor },
                  ]}
                >
                  {selectedTheme.name}
                </Text>
                <Text
                  style={[
                    styles.previewThemeVibe,
                    { color: selectedTheme.subtitleColor },
                  ]}
                >
                  {selectedTheme.vibe}
                </Text>
              </View>

              <View
                style={[
                  styles.rewardPanel,
                  {
                    backgroundColor: selectedTheme.rewardBg,
                    borderColor: selectedTheme.rewardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.rewardLabel,
                    { color: selectedTheme.subtitleColor },
                  ]}
                >
                  {TEXT.rewardLabel}
                </Text>
                <Text
                  style={[
                    styles.previewReward,
                    {
                      color: isFallbackReward
                        ? selectedTheme.rewardFallback
                        : selectedTheme.rewardText,
                    },
                  ]}
                >
                  {rewardValue || TEXT.fallbackReward}
                </Text>
              </View>

              <View style={styles.stampsGroup}>
                {stampRows.map((row, rowIndex) => (
                  <View
                    key={`stamps-row-${rowIndex + 1}`}
                    style={styles.stampsRow}
                  >
                    {row.map((slot) => {
                      const filled = slot <= completedPreviewStamps;
                      return (
                        <View
                          key={`stamp-${slot}`}
                          style={[
                            styles.stamp,
                            {
                              backgroundColor: filled
                                ? selectedTheme.stampFilledBg
                                : selectedTheme.stampEmptyBg,
                              borderColor: filled
                                ? selectedTheme.stampFilledBorder
                                : selectedTheme.stampEmptyBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.stampText,
                              {
                                color: filled
                                  ? selectedTheme.stampFilledText
                                  : selectedTheme.stampEmptyText,
                              },
                            ]}
                          >
                            {stampLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              <View style={styles.metricsRow}>
                <View
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: selectedTheme.metricBg,
                      borderColor: selectedTheme.metricBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.metricLabel,
                      { color: selectedTheme.metricLabel },
                    ]}
                  >
                    {TEXT.stampsLabel}
                  </Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: selectedTheme.metricValue },
                    ]}
                  >
                    {stampCount}
                  </Text>
                </View>
                <View
                  style={[
                    styles.metricCard,
                    {
                      backgroundColor: selectedTheme.metricBg,
                      borderColor: selectedTheme.metricBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.metricLabel,
                      { color: selectedTheme.metricLabel },
                    ]}
                  >
                    {TEXT.progressLabel}
                  </Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: selectedTheme.metricValue },
                    ]}
                  >
                    {completedPreviewStamps}/{stampCount}
                  </Text>
                </View>
              </View>
            </LinearGradient>
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
              label={TEXT.continue}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingTop: 26,
    paddingBottom: 28,
    gap: 18,
  },
  titleContainer: {
    alignItems: 'flex-end',
    gap: 8,
  },
  title: {
    fontSize: 28,
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
  previewCard: {
    minHeight: 380,
    borderRadius: 28,
    padding: 22,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  previewGlowLarge: {
    position: 'absolute',
    top: -32,
    right: -20,
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  previewGlowSmall: {
    position: 'absolute',
    bottom: 58,
    left: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  previewRing: {
    position: 'absolute',
    top: 92,
    right: -42,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  previewBusinessName: {
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'right',
  },
  previewHero: {
    marginTop: 18,
    alignItems: 'flex-end',
    gap: 4,
  },
  previewThemeName: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewThemeVibe: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'right',
  },
  rewardPanel: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  rewardLabel: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewReward: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'right',
  },
  stampsGroup: {
    marginTop: 18,
    gap: 10,
  },
  stampsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: 8,
  },
  stamp: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: {
    fontSize: 15,
    fontWeight: '900',
  },
  metricsRow: {
    marginTop: 22,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
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
    flexDirection: 'row-reverse',
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
  themeSwatchOrb: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    top: 10,
    left: 10,
  },
  themeSwatchLine: {
    width: 34,
    height: 8,
    borderRadius: 999,
    transform: [{ rotate: '-34deg' }],
  },
  themeTextBlock: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  themeTitleRow: {
    width: '100%',
    flexDirection: 'row-reverse',
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
  summaryRow: {
    flexDirection: 'row-reverse',
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
    textAlign: 'left',
  },
  submittingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
