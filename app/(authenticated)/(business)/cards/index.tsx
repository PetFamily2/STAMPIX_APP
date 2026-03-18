import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import type { StampShape } from '@/constants/stampOptions';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';

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
  redemptionsLabel: 'מימושים',
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
export default function BusinessCardsManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, section } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    section?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const activeSection = section === 'loyalty' ? 'loyalty' : 'campaigns';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  if (activeSection === 'campaigns') {
    return (
      <Redirect
        href={{
          pathname: '/(authenticated)/(business)/cards/campaigns',
          params: { preview, map },
        }}
      />
    );
  }

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const canManage =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';
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
        rewardConditions: 'מימוש בהצגת הכרטיסיה בסניף, עד 30 יום מהשלמת הכרטיסיה.',
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

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        stickyHeaderIndices={[0]}
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
              <TouchableOpacity
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
                className="h-10 w-10 items-center justify-center rounded-full border border-[#E5EAF2] bg-white"
              >
                <Ionicons name="arrow-forward" size={18} color="#1A2B4A" />
              </TouchableOpacity>
            }
          />
        </StickyScrollHeader>

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {TOP_TABS.map((topTab) => {
            const isActive = topTab.key === 'loyalty';
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'loyalty') {
                    return;
                  }
                  router.replace('/(authenticated)/(business)/cards/campaigns');
                }}
                className={`flex-1 rounded-full py-2.5 ${
                  isActive ? 'bg-[#2F6BFF]' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-center text-sm font-extrabold ${
                    isActive ? 'text-white' : 'text-[#51617F]'
                  }`}
                >
                  {topTab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
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

        <ProgramListSection
          title={TEXT.draftCardsTitle}
          emptyText={TEXT.noDraftCards}
          programs={draftPrograms}
          businessName={businessDisplayName}
          businessLogoUrl={activeBusiness?.logoUrl ?? null}
          onOpenProgram={openProgramDetails}
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
