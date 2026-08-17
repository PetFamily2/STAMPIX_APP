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
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import LoyaltyCard from '@/components/loyalty/LoyaltyCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import type { StampShape } from '@/constants/stampOptions';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlBaseView, tw } from '@/lib/rtl';

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

const TEXT = {
  errorTitle: 'שגיאה',
  createFailed: 'יצירת כרטיסיה נכשלה.',
  businessFallback: 'העסק שלך',
  screenTitle: 'כרטיסיות נאמנות',
  createNewCard: 'צור כרטיסיה חדשה',
  limitReached: 'הגעתם למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  nearLimit: 'אתם מתקרבים למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  draftCardsTitle: 'טיוטות',
  noDraftCards: 'אין כרגע כרטיסים במצב טיוטה.',
  activeCardsTitle: 'כרטיסים פעילים',
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
  emptyTitle,
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
  emptyTitle?: string;
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
    <View className="mt-5 gap-3 border-t border-[#D7E2F4] pt-4">
      {isCollapsible ? (
        <TouchableOpacity
          onPress={onToggleExpand}
          className={`${tw.flexRow} items-center justify-between`}
          style={rtlBaseView}
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
          <View className="gap-1">
            {emptyTitle ? (
              <Text
                className={`text-sm font-black text-[#0F172A] ${tw.textStart}`}
              >
                {emptyTitle}
              </Text>
            ) : null}
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              {emptyText}
            </Text>
          </View>
        ) : (
          programs.map((program) => (
            <View
              key={String(program.loyaltyProgramId)}
              className="gap-2 border-b border-[#DCE6F7] py-3"
              style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}
            >
              <LoyaltyCard
                variant="management"
                businessName={businessName}
                businessLogoUrl={businessLogoUrl}
                programImageUrl={program.imageUrl}
                programTitle={program.title}
                rewardName={program.rewardName}
                maxStamps={program.maxStamps}
                progress={{ kind: 'none' }}
                lifecycle={program.lifecycle}
                stampIcon={program.stampIcon}
                stampShape={toStampShape(program.stampShape)}
                cardThemeId={program.cardThemeId}
                onPress={() => onOpenProgram(program)}
              />

              <View
                className={`${tw.flexRow} items-center justify-between`}
                style={rtlBaseView}
              >
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
            </View>
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
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const guideTargetRef = useGuidedTargetRef();
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
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs = (useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  ) ?? []) as ManagementProgram[];
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
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.createFailed);
    } finally {
      setIsCreating(false);
    }
  };

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
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          width: '100%',
          maxWidth: 920,
          alignSelf: 'center',
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
            subtitle="ניהול הכרטיסיות הפעילות והטיוטות"
          />
        </StickyScrollHeader>

        <View ref={guideTargetRef} collapsable={false}>
          <TouchableOpacity
            disabled={!canCreate}
            onPress={() => {
              if (!canCreate) {
                return;
              }
              void handleCreate();
            }}
            className={`mt-4 min-h-[52px] rounded-2xl px-4 py-3 ${
              !canCreate ? 'bg-[#CBD5E1]' : 'bg-[#2F6BFF]'
            }`}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View
                className={`${tw.flexRow} items-center justify-center gap-2`}
                style={rtlBaseView}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text className="text-sm font-black text-white">
                  {TEXT.createNewCard}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-4 border-b border-[#D7E2F4] pb-4">
          <View className={`${tw.flexRow} items-center justify-between gap-3`}>
            <Text
              className={`text-sm font-bold text-[#334155] ${tw.textStart}`}
            >
              כרטיסיות פעילות
            </Text>
            <Text className={`text-sm font-black text-[#0F172A] ${tw.textEnd}`}>
              {activePrograms.length}/{cardLimit.limitValue}
            </Text>
          </View>
          {cardLimit.isNearLimit || cardLimit.isAtLimit ? (
            <Text
              className={`mt-2 text-xs font-bold text-[#B45309] ${tw.textStart}`}
            >
              {cardLimit.isAtLimit ? TEXT.limitReached : TEXT.nearLimit}
            </Text>
          ) : null}
        </View>

        <ProgramListSection
          title={TEXT.activeCardsTitle}
          emptyTitle="אין כרטיסיות פעילות"
          emptyText="פרסמו כרטיסייה כדי שלקוחות יוכלו להצטרף ולצבור ניקובים."
          programs={activePrograms}
          businessName={businessDisplayName}
          businessLogoUrl={activeBusiness?.logoUrl ?? null}
          onOpenProgram={openProgramDetails}
        />

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
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="programs"
        targetRef={guideTargetRef}
      />
    </SafeAreaView>
  );
}

export default function BusinessCardsManagementScreen() {
  const { preview, map, section } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    section?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname:
          section === 'campaigns'
            ? '/(authenticated)/(business)/campaigns'
            : '/(authenticated)/(business)/programs',
        params: {
          ...(preview ? { preview } : {}),
          ...(map ? { map } : {}),
        },
      }}
    />
  );
}
