import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useConvexAuth, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { normalizeStampShape } from '@/constants/stampOptions';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import {
  consumePendingJoin,
  savePendingJoin,
} from '@/lib/deeplink/pendingJoin';
import { alignItems, flexDirection, rtlBaseView, selfStart } from '@/lib/rtl';

const TEXT = {
  title: 'הארנק שלי',
  subtitle: 'כאן יופיעו הכרטיסיות וההטבות שלך',
  joinBusinessTitle: 'הצטרף לעסק',
  loading: 'טוען עסקים',
  noCards: 'הארנק שלך עדיין ריק',
  noCardsHint:
    'כאן יופיעו הכרטיסיות אחרי שתצטרפו לעסק. אפשר לסרוק QR בבית העסק או למצוא עסק בסביבה.',
  joinWithQrCta: 'הצטרפות עם QR',
  findNearbyCta: 'מציאת עסקים בסביבה',
  businessFallback: 'עסק',
  joinedPrograms: 'כרטיסיות שלי',
  openBusiness: 'פתח את העסק',
  pendingInviteTitle: 'יש לך הזמנה ממתינה לצוות',
  pendingInviteAction: 'לצפייה ואישור',
};

const REFERRALS_TITLE = 'הזמנות חברים';
const REFERRALS_OPEN = 'למסך ההזמנות';

type WalletBusiness = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  joinedProgramCount: number;
  redeemableCount: number;
  lastActivityAt: number;
  previewProgramTitle: string | null;
  previewRewardName: string | null;
  previewProgramImageUrl: string | null;
  previewCardThemeId: string | null;
  previewMaxStamps: number | null;
  previewCurrentStamps: number | null;
  previewStampShape: string | null;
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { isAuthenticated } = useConvexAuth();
  const sessionContext = useSessionContext();
  const pendingJoinChecked = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || pendingJoinChecked.current) {
      return;
    }
    pendingJoinChecked.current = true;
    void (async () => {
      const pending = await consumePendingJoin();
      if (pending?.biz || pending?.ref || pending?.bref) {
        await savePendingJoin(pending);
        router.push({
          pathname: '/(authenticated)/join',
          params: {
            biz: pending.biz,
            ref: pending.ref,
            bref: pending.bref,
            src: pending.src,
            camp: pending.camp,
          },
        });
      }
    })();
  }, [isAuthenticated]);

  const businessesQuery = useQuery(
    api.memberships.byCustomerBusinesses,
    isAuthenticated ? {} : 'skip'
  );
  const referralDashboard = useQuery(
    api.referrals.getMyReferralDashboard,
    isAuthenticated ? {} : 'skip'
  );
  const businesses = (businessesQuery ?? []) as WalletBusiness[];
  const pendingStaffInvites = sessionContext?.pendingInvites ?? [];
  const firstPendingStaffInvite = pendingStaffInvites[0] ?? null;

  const isLoading = isAuthenticated && businessesQuery === undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        alwaysBounceVertical={false}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.headerRow}>
            <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
          </View>
        </StickyScrollHeader>

        <View style={styles.joinBusinessRow}>
          <Pressable
            onPress={() => router.push('/(authenticated)/join')}
            style={({ pressed }) => [
              styles.joinBusinessButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={TEXT.joinBusinessTitle}
          >
            <View style={styles.joinBusinessButtonContent}>
              <View style={styles.joinBusinessPlusCircle}>
                <View style={styles.joinBusinessPlusHorizontal} />
                <View style={styles.joinBusinessPlusVertical} />
              </View>
              <Text style={styles.joinBusinessTitle}>
                {TEXT.joinBusinessTitle}
              </Text>
            </View>
          </Pressable>
        </View>

        {pendingStaffInvites.length > 0 ? (
          <View style={styles.pendingInviteCard}>
            <Text style={styles.pendingInviteTitle}>
              {TEXT.pendingInviteTitle}
            </Text>
            <Text style={styles.pendingInviteSubtitle}>
              {firstPendingStaffInvite
                ? `${firstPendingStaffInvite.businessName} · תפקיד: ${
                    firstPendingStaffInvite.targetRole === 'manager'
                      ? 'מנהל'
                      : 'עובד'
                  }`
                : `כמות הזמנות: ${pendingStaffInvites.length}`}
            </Text>
            <Pressable
              onPress={() => router.push('/(authenticated)/accept-invite')}
              style={({ pressed }) => [
                styles.pendingInviteButton,
                pressed ? styles.pressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={TEXT.pendingInviteAction}
            >
              <Text style={styles.pendingInviteButtonText}>
                {TEXT.pendingInviteAction}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.cardContainer}>
            <Text style={styles.infoText}>{TEXT.loading}</Text>
          </View>
        ) : null}

        {!isLoading && businesses.length === 0 ? (
          <View style={styles.cardContainer}>
            <Text style={styles.emptyTitle}>{TEXT.noCards}</Text>
            <Text style={styles.infoText}>{TEXT.noCardsHint}</Text>
            <View style={styles.emptyActionsRow}>
              <Pressable
                onPress={() => router.push('/(authenticated)/join')}
                style={({ pressed }) => [
                  styles.emptyPrimaryButton,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={TEXT.joinWithQrCta}
              >
                <Text style={styles.emptyPrimaryButtonText}>
                  {TEXT.joinWithQrCta}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push('/(authenticated)/(customer)/discovery')
                }
                style={({ pressed }) => [
                  styles.emptySecondaryButton,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={TEXT.findNearbyCta}
              >
                <Text style={styles.emptySecondaryButtonText}>
                  {TEXT.findNearbyCta}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.cardList}>
          {!isLoading
            ? businesses.map((business) => {
                const businessId = String(business.businessId);
                const aggregateMetaItems: string[] = [];

                if (
                  business.joinedProgramCount > 1 &&
                  business.previewRewardName !== null
                ) {
                  aggregateMetaItems.push(
                    `${business.joinedProgramCount} כרטיסיות`
                  );
                }

                if (business.redeemableCount === 1) {
                  aggregateMetaItems.push('הטבה אחת מוכנה למימוש');
                } else if (business.redeemableCount > 1) {
                  aggregateMetaItems.push(
                    `${business.redeemableCount} הטבות מוכנות למימוש`
                  );
                }

                const aggregateMeta = aggregateMetaItems.join(' · ');
                return (
                  <Pressable
                    key={businessId}
                    style={styles.cardContainer}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/(authenticated)/(customer)/business/[businessId]',
                        params: { businessId },
                      } as any)
                    }
                  >
                    <ProgramCustomerCardPreview
                      businessName={
                        business.businessName ?? TEXT.businessFallback
                      }
                      businessLogoUrl={business.businessLogoUrl}
                      programImageUrl={business.previewProgramImageUrl}
                      title={
                        business.previewProgramTitle ?? TEXT.joinedPrograms
                      }
                      rewardName={
                        business.previewRewardName ??
                        `${TEXT.joinedPrograms}: ${business.joinedProgramCount}`
                      }
                      maxStamps={Math.max(
                        1,
                        Number(business.previewMaxStamps ?? 1)
                      )}
                      previewCurrentStamps={Number(
                        business.previewCurrentStamps ?? 0
                      )}
                      cardThemeId={business.previewCardThemeId}
                      stampShape={normalizeStampShape(
                        business.previewStampShape
                      )}
                      status={
                        business.redeemableCount > 0 ? 'redeemable' : 'default'
                      }
                      variant="compact"
                      showAllStamps={true}
                    />

                    {aggregateMeta ? (
                      <Text style={styles.aggregateMetaText}>
                        {aggregateMeta}
                      </Text>
                    ) : null}

                    <View style={styles.openRow}>
                      <Text style={styles.openText}>{TEXT.openBusiness}</Text>
                      <Ionicons name="chevron-back" size={14} color="#5B6475" />
                    </View>
                  </Pressable>
                );
              })
            : null}
        </View>

        <Pressable
          onPress={() => router.push('/(authenticated)/(customer)/referrals')}
          style={({ pressed }) => [
            styles.referralCard,
            pressed ? styles.pressed : null,
          ]}
        >
          <View style={styles.referralCopy}>
            <Text style={styles.referralCardTitle}>{REFERRALS_TITLE}</Text>
            <Text style={styles.referralCardSubtitle}>
              {referralDashboard?.pending ?? 0} ממתינות ·{' '}
              {referralDashboard?.earned ?? 0} תגמולים
            </Text>
          </View>
          <View style={styles.referralOpenRow}>
            <Text style={styles.referralOpenText}>{REFERRALS_OPEN}</Text>
            <Ionicons name="chevron-back" size={14} color="#1D4ED8" />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 0,
  },
  joinBusinessRow: {
    width: '100%',
    alignItems: alignItems.start,
    marginTop: 0,
  },
  joinBusinessButton: {
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#9CC0FF',
  },
  joinBusinessButtonContent: {
    ...rtlBaseView,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  joinBusinessPlusCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBusinessPlusHorizontal: {
    position: 'absolute',
    width: 15,
    height: 3.4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  joinBusinessPlusVertical: {
    position: 'absolute',
    width: 3.4,
    height: 15,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  joinBusinessTitle: {
    color: '#1E3A8A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  referralCard: {
    marginTop: 20,
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: '#C9D8F5',
    paddingHorizontal: 2,
    paddingTop: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  referralCopy: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 2,
  },
  referralCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  referralCardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    lineHeight: 18,
  },
  referralOpenRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  referralOpenText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pendingInviteCard: {
    marginTop: 12,
    backgroundColor: '#FFF7E8',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F5D5A0',
    padding: 14,
    gap: 8,
  },
  pendingInviteTitle: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  pendingInviteSubtitle: {
    color: '#7C2D12',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  pendingInviteButton: {
    alignSelf: selfStart,
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#9CC0FF',
  },
  pendingInviteButtonText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  cardList: {
    marginTop: 18,
    gap: 12,
  },
  cardContainer: {
    borderRadius: 22,
    paddingBottom: 2,
  },
  aggregateMetaText: {
    marginTop: 8,
    paddingHorizontal: 4,
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    color: '#0B1220',
  },
  infoText: {
    marginTop: 6,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
    fontWeight: '600',
    lineHeight: 20,
  },
  emptyActionsRow: {
    marginTop: 14,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyPrimaryButton: {
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySecondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySecondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  openRow: {
    marginTop: 8,
    paddingHorizontal: 4,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
