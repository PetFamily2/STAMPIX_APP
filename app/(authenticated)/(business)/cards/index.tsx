import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { LoyaltyCardCompact } from '@/components/loyalty/LoyaltyCardCompact';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlBaseView, tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

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
  screenTitle: 'כרטיסיות נאמנות',
  createNewCard: 'צור כרטיסיה חדשה',
  limitReached: 'הגעתם למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  nearLimit: 'אתם מתקרבים למגבלת הכרטיסים הפעילים במסלול הנוכחי.',
  draftCardsTitle: 'טיוטות',
  noDraftCards: 'אין כרגע כרטיסים במצב טיוטה.',
  activeCardsTitle: 'כרטיסים פעילים',
  archivedCardsTitle: 'כרטיסים בארכיון',
  noArchivedCards: 'אין כרגע כרטיסים בארכיון.',
} as const;

function ProgramListSection({
  title,
  emptyTitle,
  emptyText,
  programs,
  onOpenProgram,
  isCollapsible = false,
  isExpanded = true,
  onToggleExpand,
}: {
  title: string;
  emptyTitle?: string;
  emptyText: string;
  programs: ManagementProgram[];
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
              className="py-1.5"
              style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}
            >
              <LoyaltyCardCompact
                title={program.title}
                rewardName={program.rewardName}
                lifecycle={program.lifecycle}
                stampIcon={program.stampIcon}
                cardThemeId={program.cardThemeId}
                memberCount={program.metrics.totalMembers}
                onPress={() => onOpenProgram(program)}
              />
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
  const { entitlements, limitStatus } = useEntitlements(activeBusinessId);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programsQuery = useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const programs = (programsQuery ?? []) as ManagementProgram[];
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
  const nonArchivedProgramCount = draftPrograms.length + activePrograms.length;

  const cardLimit = limitStatus('maxCards', nonArchivedProgramCount);
  const canCreate =
    Boolean(activeBusinessId) && canManage && !cardLimit.isAtLimit;

  const handleCreate = () => {
    if (!activeBusinessId || !canCreate) {
      return;
    }
    router.push({
      pathname: '/(authenticated)/(business)/cards/new' as never,
      params: { businessId: String(activeBusinessId) },
    });
  };

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
              handleCreate();
            }}
            className={`mt-4 min-h-[52px] rounded-2xl px-4 py-3 ${
              !canCreate ? 'bg-[#CBD5E1]' : 'bg-[#2F6BFF]'
            }`}
          >
            <View
              className={`${tw.flexRow} items-center justify-center gap-2`}
              style={rtlBaseView}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text className="text-sm font-black text-white">
                {TEXT.createNewCard}
              </Text>
            </View>
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
              {nonArchivedProgramCount} מתוך {cardLimit.limitValue} כרטיסיות
            </Text>
          </View>
          {cardLimit.isNearLimit || cardLimit.isAtLimit ? (
            <View className="mt-2 gap-2">
              <Text
                className={`text-xs font-bold text-[#B45309] ${tw.textStart}`}
              >
                {cardLimit.isAtLimit ? TEXT.limitReached : TEXT.nearLimit}
              </Text>
              {cardLimit.isAtLimit && canManage ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() =>
                    openSubscriptionComparison(router, {
                      featureKey: 'maxCards',
                      requiredPlan:
                        entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[
                          entitlements.plan
                        ]?.maxCards ?? null,
                      reason: 'limit_reached',
                    })
                  }
                  className={`${tw.selfStart} min-h-[44px] justify-center rounded-xl border border-[#B8C8E8] bg-white px-3`}
                >
                  <Text className="text-xs font-black text-[#1D4ED8]">
                    לבדיקת מסלולים
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {programsQuery === undefined ? (
          <View className="mt-5 min-h-[110px] items-center justify-center rounded-2xl border border-[#D7E2F4] bg-white">
            <ActivityIndicator color="#2F6BFF" />
            <Text className="mt-2 text-sm font-bold text-[#64748B]">
              טוענים כרטיסיות…
            </Text>
          </View>
        ) : (
          <>
            <ProgramListSection
              title={TEXT.activeCardsTitle}
              emptyTitle="אין כרטיסיות פעילות"
              emptyText="פרסמו כרטיסייה כדי שלקוחות יוכלו להצטרף ולצבור חותמות."
              programs={activePrograms}
              onOpenProgram={openProgramDetails}
            />

            <ProgramListSection
              title={TEXT.draftCardsTitle}
              emptyText={TEXT.noDraftCards}
              programs={draftPrograms}
              onOpenProgram={openProgramDetails}
              isCollapsible={true}
              isExpanded={isDraftCardsExpanded}
              onToggleExpand={() =>
                setIsDraftCardsExpanded((current) => !current)
              }
            />

            <ProgramListSection
              title={TEXT.archivedCardsTitle}
              emptyText={TEXT.noArchivedCards}
              programs={archivedPrograms}
              onOpenProgram={openProgramDetails}
              isCollapsible={true}
              isExpanded={isArchivedCardsExpanded}
              onToggleExpand={() =>
                setIsArchivedCardsExpanded((current) => !current)
              }
            />
          </>
        )}
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
