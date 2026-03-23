import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import {
  BarComparisonChart,
  HorizontalRankingChart,
  InsightCard,
  KpiCard,
  ProgramHealthRow,
  SegmentedPillControl,
} from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import type { StampShape } from '@/constants/stampOptions';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { tw } from '@/lib/rtl';
import { CampaignsHubContent } from './campaigns';

type MarketingTopTab = 'campaigns' | 'loyalty';
type ProgramLifecycle = 'draft' | 'active' | 'archived';

type ManagementProgram = {
  loyaltyProgramId: Id<'loyaltyPrograms'>;
  title: string;
  imageUrl: string | null;
  rewardName: string;
  maxStamps: number;
  stampIcon: string;
  stampShape: string;
  cardThemeId: string;
  lifecycle: ProgramLifecycle;
  status: ProgramLifecycle;
  isRuleLocked: boolean;
  canDelete: boolean;
  membershipCount: number;
  metrics: {
    activeMembers: number;
    totalMembers: number;
    stamps7d: number;
    redemptions30d: number;
    lastActivityAt: number | null;
  };
};

const TOP_TABS: Array<{ key: MarketingTopTab; label: string }> = [
  { key: 'campaigns', label: 'קמפיינים' },
  { key: 'loyalty', label: 'כרטיסיות נאמנות' },
];

const TEXT = {
  errorTitle: 'שגיאה',
  createFailed: 'יצירת כרטיסיה נכשלה.',
  businessFallback: 'העסק שלך',
  screenTitle: 'כרטיסיות נאמנות',
  screenSubtitle: 'יצירה וניהול כרטיסי נאמנות במצב טיוטה, פעיל או ארכיון',
  createNewCard: 'צור כרטיסיה חדשה',
  usageTitle: 'שימוש במסלול',
  cardsLabel: 'כרטיסים פעילים',
  inUseLabel: 'נספרים במגבלה',
  customersLabel: 'לקוחות פעילים',
  activeLabel: 'בכרטיסים פעילים',
  redemptionsLabel:
    '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05de\u05d5\u05de\u05e9\u05d5',
  days30Label: '30 יום',
  limitReached: 'הגעתם למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  nearLimit: 'אתם מתקרבים למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  draftCardsTitle: 'טיוטות',
  noDraftCards: 'אין כרגע כרטיסים במצב טיוטה.',
  activeCardsTitle: 'כרטיסים פעילים',
  noActiveCards: 'אין כרגע כרטיסים פעילים.',
  archivedCardsTitle: 'כרטיסים בארכיון',
  noArchivedCards: 'אין כרגע כרטיסים בארכיון.',
  openDetails: 'פתח לעריכה',
} as const;

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

const toStampShape = (value: string): StampShape => {
  if (
    value === 'circle' ||
    value === 'roundedSquare' ||
    value === 'square' ||
    value === 'hexagon' ||
    value === 'icon'
  ) {
    return value;
  }
  return 'circle';
};

function ProgramListSection({
  title,
  emptyText,
  programs,
  businessName,
  businessLogoUrl,
  onOpenProgram,
  isCollapsible = false,
  isExpanded = true,
  onToggleExpand,
}: {
  title: string;
  emptyText: string;
  programs: ManagementProgram[];
  businessName: string;
  businessLogoUrl: string | null;
  onOpenProgram: (program: ManagementProgram) => void;
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const shouldRenderContent = !isCollapsible || isExpanded;

  return (
    <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
      {isCollapsible ? (
        <TouchableOpacity
          onPress={onToggleExpand}
          className={`${tw.flexRow} items-center justify-between`}
        >
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            {title} ({programs.length})
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#64748B"
          />
        </TouchableOpacity>
      ) : (
        <Text
          className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
        >
          {title} ({programs.length})
        </Text>
      )}

      {shouldRenderContent ? (
        programs.length === 0 ? (
          <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
            {emptyText}
          </Text>
        ) : (
          programs.map((program) => (
            <TouchableOpacity
              key={String(program.loyaltyProgramId)}
              onPress={() => onOpenProgram(program)}
              className="rounded-[28px] border border-[#DCE7FF] bg-[#F8FBFF] p-3 gap-3"
            >
              <ProgramCustomerCardPreview
                businessName={businessName}
                businessLogoUrl={businessLogoUrl}
                programImageUrl={program.imageUrl}
                title={program.title}
                rewardName={program.rewardName}
                maxStamps={program.maxStamps}
                stampIcon={program.stampIcon}
                stampShape={toStampShape(program.stampShape)}
                cardThemeId={program.cardThemeId}
                status={
                  program.lifecycle === 'archived' ? 'archived' : 'default'
                }
                variant="list"
              />

              <View className={`${tw.flexRow} items-center justify-between`}>
                <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
                  <Text className="text-[11px] font-bold text-[#1D4ED8]">
                    {program.lifecycle === 'draft'
                      ? 'טיוטה'
                      : program.lifecycle === 'archived'
                        ? 'בארכיון'
                        : 'פעיל'}
                  </Text>
                </View>

                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  לקוחות: {formatNumber(program.metrics.totalMembers)}
                </Text>

                <Text className="text-xs font-bold text-[#334155]">
                  {TEXT.openDetails}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )
      ) : null}
    </View>
  );
}
export function LoyaltyCardsHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canManage = businessCapabilities?.edit_loyalty_cards === true;
  const { limitStatus } = useEntitlements(activeBusinessId);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs = (useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  ) ?? []) as ManagementProgram[];
  const rewardEligibilitySummary = useQuery(
    api.memberships.getBusinessRewardEligibilitySummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const createLoyaltyProgram = useMutation(
    api.loyaltyPrograms.createLoyaltyProgram
  );

  const [isCreating, setIsCreating] = useState(false);
  const [isDraftCardsExpanded, setIsDraftCardsExpanded] = useState(false);
  const [isArchivedCardsExpanded, setIsArchivedCardsExpanded] = useState(false);

  const draftPrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'draft'),
    [programs]
  );
  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );
  const archivedPrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'archived'),
    [programs]
  );

  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const canCreate = Boolean(activeBusinessId) && canManage && !isCreating;

  const handleCreate = async () => {
    if (!activeBusinessId || !canCreate) {
      return;
    }

    setIsCreating(true);
    try {
      const result = await createLoyaltyProgram({
        businessId: activeBusinessId,
        title: 'כרטיסיית קפה לדוגמה',
        rewardName: 'קפה מתנה',
        maxStamps: 10,
        stampIcon: 'star',
        cardTerms: 'ניקוב אחד לכל קנייה מזכה. אין כפל מבצעים.',
        rewardConditions:
          'מימוש בהצגת הכרטיסיה בסניף, עד 30 יום מהשלמת הכרטיסיה.',
      });
      router.push({
        pathname: '/(authenticated)/(business)/cards/[programId]',
        params: {
          programId: String(result.loyaltyProgramId),
          businessId: String(activeBusinessId),
        },
      });
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.createFailed
      );
    } finally {
      setIsCreating(false);
    }
  };

  const totalCustomers = activePrograms.reduce(
    (sum, program) => sum + program.metrics.activeMembers,
    0
  );
  const totalRedemptions30d = activePrograms.reduce(
    (sum, program) => sum + program.metrics.redemptions30d,
    0
  );
  const redeemableCustomersCount =
    rewardEligibilitySummary?.redeemableCustomers ?? 0;
  const redeemableCardsCount = rewardEligibilitySummary?.redeemableCards ?? 0;
  const businessDisplayName =
    activeBusiness?.name?.trim() || TEXT.businessFallback;

  const openProgramDetails = (program: ManagementProgram) => {
    if (!activeBusinessId) {
      return;
    }
    router.push({
      pathname: '/(authenticated)/(business)/cards/[programId]',
      params: {
        programId: String(program.loyaltyProgramId),
        businessId: String(activeBusinessId),
      },
    });
  };

  const topProgramActivity = useMemo(
    () =>
      activePrograms
        .slice()
        .sort((a, b) => (b.metrics.stamps7d ?? 0) - (a.metrics.stamps7d ?? 0))
        .slice(0, 5)
        .map((program) => ({
          label: program.title,
          value: Number(program.metrics.stamps7d ?? 0),
        })),
    [activePrograms]
  );

  const topProgramRedemptions = useMemo(
    () =>
      activePrograms
        .slice()
        .sort(
          (a, b) =>
            (b.metrics.redemptions30d ?? 0) - (a.metrics.redemptions30d ?? 0)
        )
        .slice(0, 5)
        .map((program) => ({
          label: program.title,
          value: Number(program.metrics.redemptions30d ?? 0),
        })),
    [activePrograms]
  );

  const mostActiveProgram = useMemo(
    () =>
      activePrograms
        .slice()
        .sort(
          (a, b) => (b.metrics.stamps7d ?? 0) - (a.metrics.stamps7d ?? 0)
        )[0] ?? null,
    [activePrograms]
  );

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title={TEXT.screenTitle}
            subtitle={TEXT.screenSubtitle}
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
              />
            }
          />
        </StickyScrollHeader>

        <View style={{ marginTop: 4 }}>
          <SegmentedPillControl
            items={TOP_TABS}
            value="loyalty"
            onChange={(nextTab) => {
              if (nextTab === 'campaigns') {
                router.setParams({ section: 'campaigns' });
              }
            }}
          />
        </View>

        <TouchableOpacity
          disabled={!canCreate}
          onPress={() => {
            if (!canCreate) {
              return;
            }
            void handleCreate();
          }}
          className={`mt-4 rounded-3xl px-4 py-4 ${
            !canCreate ? 'bg-[#CBD5E1]' : 'bg-[#2F6BFF]'
          }`}
        >
          {isCreating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View className={`${tw.flexRow} items-center justify-center gap-2`}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text className="text-sm font-black text-white">
                {TEXT.createNewCard}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCell}>
            <KpiCard
              label="כרטיסים פעילים"
              value={formatNumber(activePrograms.length)}
              icon="albums-outline"
              tone="blue"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="לקוחות פעילים"
              value={formatNumber(totalCustomers)}
              icon="people-outline"
              tone="teal"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="מימושים 30 יום"
              value={formatNumber(totalRedemptions30d)}
              icon="gift-outline"
              tone="violet"
            />
          </View>
          <View style={styles.kpiCell}>
            <KpiCard
              label="זכאים למימוש"
              value={formatNumber(redeemableCustomersCount)}
              icon="sparkles-outline"
              tone="emerald"
            />
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            {TEXT.usageTitle}
          </Text>

          <View className={`${tw.flexRow} mt-3 gap-2`}>
            <View className="flex-1 rounded-2xl border border-[#DCE7F8] bg-white p-3">
              <Text className={`text-[11px] text-[#64748B] ${tw.textStart}`}>
                {TEXT.cardsLabel}
              </Text>
              <Text
                className={`mt-1 text-lg font-black text-[#0F172A] ${tw.textStart}`}
              >
                {activePrograms.length}/{cardLimit.limitValue}
              </Text>
              <Text className={`text-[10px] text-[#94A3B8] ${tw.textStart}`}>
                {TEXT.inUseLabel}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-[#DCE7F8] bg-white p-3">
              <Text className={`text-[11px] text-[#64748B] ${tw.textStart}`}>
                {TEXT.customersLabel}
              </Text>
              <Text
                className={`mt-1 text-lg font-black text-[#0F172A] ${tw.textStart}`}
              >
                {formatNumber(totalCustomers)}
              </Text>
              <Text className={`text-[10px] text-[#94A3B8] ${tw.textStart}`}>
                {TEXT.activeLabel}
              </Text>
            </View>

            <View className="flex-1 rounded-2xl border border-[#DCE7F8] bg-white p-3">
              <Text className={`text-[11px] text-[#64748B] ${tw.textStart}`}>
                {TEXT.redemptionsLabel}
              </Text>
              <Text
                className={`mt-1 text-lg font-black text-[#0F172A] ${tw.textStart}`}
              >
                {formatNumber(totalRedemptions30d)}
              </Text>
              <Text className={`text-[10px] text-[#94A3B8] ${tw.textStart}`}>
                {TEXT.days30Label}
              </Text>
            </View>
          </View>
          <Text
            className={`mt-3 text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            לקוחות זכאים להטבה: {formatNumber(redeemableCustomersCount)} ·
            כרטיסיות מלאות: {formatNumber(redeemableCardsCount)}
          </Text>

          {cardLimit.isNearLimit || cardLimit.isAtLimit ? (
            <View className="mt-4 rounded-2xl border border-[#F59E0B] bg-[#FFF7ED] p-3">
              <Text
                className={`text-xs font-bold text-[#B45309] ${tw.textStart}`}
              >
                {cardLimit.isAtLimit ? TEXT.limitReached : TEXT.nearLimit}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.analyticsStack}>
          <HorizontalRankingChart
            title="תוכניות מובילות לפי פעילות"
            subtitle="דירוג לפי ניקובים ב-7 ימים"
            data={topProgramActivity}
            color={DASHBOARD_TOKENS.colors.teal}
          />
          <BarComparisonChart
            title="השוואת מימושים"
            subtitle="מימושים ב-30 ימים אחרונים"
            data={topProgramRedemptions}
            color={DASHBOARD_TOKENS.colors.violet}
          />
          <InsightCard
            title="תובנת נאמנות"
            body={
              mostActiveProgram
                ? `התוכנית "${mostActiveProgram.title}" מובילה עם ${formatNumber(
                    mostActiveProgram.metrics.stamps7d
                  )} ניקובים ב-7 ימים.`
                : 'עדיין אין פעילות מספקת להצגת תוכנית מובילה.'
            }
            tags={[
              `לקוחות זכאים: ${formatNumber(redeemableCustomersCount)}`,
              `כרטיסיות מלאות: ${formatNumber(redeemableCardsCount)}`,
            ]}
          />
          <View style={styles.programHealthList}>
            {activePrograms.slice(0, 3).map((program) => (
              <ProgramHealthRow
                key={String(program.loyaltyProgramId)}
                title={program.title}
                members={program.metrics.activeMembers}
                stamps7d={program.metrics.stamps7d}
                redemptions30d={program.metrics.redemptions30d}
                onPress={() => openProgramDetails(program)}
              />
            ))}
          </View>
        </View>

        <ProgramListSection
          title={TEXT.draftCardsTitle}
          emptyText={TEXT.noDraftCards}
          programs={draftPrograms}
          businessName={businessDisplayName}
          businessLogoUrl={activeBusiness?.logoUrl ?? null}
          onOpenProgram={openProgramDetails}
          isCollapsible={true}
          isExpanded={isDraftCardsExpanded}
          onToggleExpand={() => setIsDraftCardsExpanded((current) => !current)}
        />

        <ProgramListSection
          title={TEXT.activeCardsTitle}
          emptyText={TEXT.noActiveCards}
          programs={activePrograms}
          businessName={businessDisplayName}
          businessLogoUrl={activeBusiness?.logoUrl ?? null}
          onOpenProgram={openProgramDetails}
        />

        <ProgramListSection
          title={TEXT.archivedCardsTitle}
          emptyText={TEXT.noArchivedCards}
          programs={archivedPrograms}
          businessName={businessDisplayName}
          businessLogoUrl={activeBusiness?.logoUrl ?? null}
          onOpenProgram={openProgramDetails}
          isCollapsible={true}
          isExpanded={isArchivedCardsExpanded}
          onToggleExpand={() =>
            setIsArchivedCardsExpanded((current) => !current)
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCell: {
    width: '48%',
  },
  analyticsStack: {
    marginTop: 16,
    gap: 14,
  },
  programHealthList: {
    gap: 10,
  },
});

export default function BusinessCardsManagementScreen() {
  const { section } = useLocalSearchParams<{
    section?: string;
  }>();

  const activeSection = section === 'loyalty' ? 'loyalty' : 'campaigns';

  if (activeSection === 'campaigns') {
    return <CampaignsHubContent />;
  }

  return <LoyaltyCardsHubContent />;
}
