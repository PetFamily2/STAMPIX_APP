import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

type ManagementCampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';

type ManagementCampaign = {
  campaignId: Id<'campaigns'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'> | null;
  type: ManagementCampaignType;
  title: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  automationEnabled: boolean;
  lifecycle: 'active' | 'inactive' | 'archived';
  canArchive: boolean;
  estimatedAudience: number;
  reachedMessagesAllTime: number;
  lastSentAt: number | null;
  archivedAt: number | null;
  updatedAt: number;
};

function formatDateTime(value: number | null) {
  if (!value) {
    return 'טרם נשלח';
  }
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function campaignTypeMeta(type: ManagementCampaignType): {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBgClass: string;
} {
  switch (type) {
    case 'welcome':
      return {
        label: 'ברוכים הבאים',
        icon: 'hand-left-outline',
        iconColor: '#1D4ED8',
        iconBgClass: 'bg-[#DBEAFE]',
      };
    case 'birthday':
      return {
        label: 'יום הולדת',
        icon: 'gift-outline',
        iconColor: '#C2410C',
        iconBgClass: 'bg-[#FFEDD5]',
      };
    case 'anniversary':
      return {
        label: 'יום נישואין',
        icon: 'heart-outline',
        iconColor: '#9D174D',
        iconBgClass: 'bg-[#FCE7F3]',
      };
    case 'winback':
      return {
        label: 'השבת לקוחות',
        icon: 'refresh-outline',
        iconColor: '#0F766E',
        iconBgClass: 'bg-[#CCFBF1]',
      };
    case 'promo':
      return {
        label: 'מבצע כללי',
        icon: 'megaphone-outline',
        iconColor: '#4C1D95',
        iconBgClass: 'bg-[#EDE9FE]',
      };
    default:
      return {
        label: 'קמפיין',
        icon: 'megaphone-outline',
        iconColor: '#1D4ED8',
        iconBgClass: 'bg-[#DBEAFE]',
      };
  }
}

export default function StaffPromotionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId } = useActiveBusiness();

  const campaignsQuery = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const campaigns = (campaignsQuery ?? []) as ManagementCampaign[];

  const activeCampaigns = useMemo(
    () =>
      campaigns
        .filter((campaign) => campaign.lifecycle === 'active')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [campaigns]
  );

  const programNameById = useMemo(() => {
    const mapById = new Map<string, string>();
    for (const program of programs) {
      mapById.set(String(program.loyaltyProgramId), program.title);
    }
    return mapById;
  }, [programs]);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

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
          <BusinessScreenHeader title="מבצעים" subtitle="מבצעים פעילים לעסק" />
        </StickyScrollHeader>

        {campaignsQuery === undefined ? (
          <View className="items-center justify-center py-12">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : activeCampaigns.length === 0 ? (
          <View className="mt-4 rounded-2xl border border-[#E5EAF2] bg-white p-6">
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              אין מבצעים פעילים כרגע.
            </Text>
          </View>
        ) : (
          <View className="mt-4 gap-3">
            {activeCampaigns.map((campaign) => {
              const typeMeta = campaignTypeMeta(campaign.type);
              const campaignProgram =
                campaign.programId != null
                  ? (programNameById.get(String(campaign.programId)) ??
                    'תוכנית לא זמינה')
                  : 'כל העסק';

              return (
                <View
                  key={String(campaign.campaignId)}
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
                >
                  <View
                    className={`${tw.flexRow} items-center justify-between gap-3`}
                  >
                    <View className={`${tw.flexRow} flex-1 items-center gap-3`}>
                      <View
                        className={`h-11 w-11 items-center justify-center rounded-xl ${typeMeta.iconBgClass}`}
                      >
                        <Ionicons
                          name={typeMeta.icon}
                          size={20}
                          color={typeMeta.iconColor}
                        />
                      </View>
                      <View className="flex-1 items-end">
                        <Text
                          className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {campaign.title}
                        </Text>
                        <Text
                          className={`mt-0.5 text-xs font-semibold ${tw.textStart}`}
                          style={{ color: typeMeta.iconColor }}
                        >
                          {typeMeta.label}
                        </Text>
                      </View>
                    </View>
                    <View className="rounded-full bg-[#16A34A] px-3 py-1.5">
                      <Text className="text-xs font-extrabold text-white">
                        פעיל
                      </Text>
                    </View>
                  </View>
                  <View className="mt-3 gap-1">
                    <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                      סוג: {typeMeta.label} • אוטומציה:{' '}
                      {campaign.automationEnabled ? 'פעילה' : 'כבויה'}
                    </Text>
                    <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                      שיוך: {campaignProgram}
                    </Text>
                    <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                      קהל מוערך: {formatNumber(campaign.estimatedAudience)} •
                      הודעות שנשלחו:{' '}
                      {formatNumber(campaign.reachedMessagesAllTime)}
                    </Text>
                    <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                      שליחה אחרונה: {formatDateTime(campaign.lastSentAt)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
