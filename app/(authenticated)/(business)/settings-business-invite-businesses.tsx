import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import { BusinessSettingsSubpageHeader } from '@/components/business-settings';
import { REVENUECAT_PACKAGE_BY_PLAN_PERIOD } from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { isBillingPeriod, isBusinessPlan } from '@/lib/billing/productionContract';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';
import { REFERRAL_COPY, earnedRewardLabel, qualificationProgressLabel, referralStatusLabel } from '@/lib/referrals/copy';
import { ReferralShareCreative } from '@/components/referrals/ReferralShareCreative';
import { RewardEarnedCelebration } from '@/components/referrals/RewardEarnedCelebration';
import { buildReferralShareCreative } from '@/lib/referrals/shareCreative';
import { shareReferralInvite } from '@/lib/referrals/shareInvite';

function BusinessInviteContent({
  businessId,
  businessPublicName,
  isTablet,
  isSwitchingBusiness,
  canRedeemBilling,
}: {
  businessId: Id<'businesses'>;
  businessPublicName: string;
  isTablet: boolean;
  isSwitchingBusiness: boolean;
  canRedeemBilling: boolean;
}) {
  const createBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );
  const hub = useQuery(
    api.businessReferralEngine.getBusinessReferralHub,
    isSwitchingBusiness ? 'skip' : { businessId }
  );
  const prepareRedemption = useMutation(
    api.businessReferralEngine.prepareReferralRewardRedemption
  );
  const confirmRedemption = useMutation(
    api.businessReferralEngine.confirmReferralRewardRedemption
  );
  const billingIdentity = useQuery(
    api.businessBilling.getBusinessBillingIdentity,
    canRedeemBilling ? { businessId } : 'skip'
  );
  const { purchasePackage } = useRevenueCat();
  const creativeRef = useRef<View>(null);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const isSummaryLoading = isSwitchingBusiness || hub == null;
  const newestEarned = hub?.rewards?.find(
    (row: { status: string; months: number }) =>
      row.status === 'earned' || row.status === 'redeemable'
  );

  const handleShare = async (mode: 'whatsapp' | 'copy' | 'native') => {
    if (isSwitchingBusiness || isShareLoading) {
      return;
    }
    try {
      setIsShareLoading(true);
      const link = await createBusinessReferralLink({ businessId });
      const creative = buildReferralShareCreative({
        businessPublicName,
        code: link.code,
        variant: 'general',
      });
      let imageUri: string | null = null;
      try {
        imageUri = await captureRef(creativeRef, {
          format: 'png',
          quality: 0.92,
          result: 'tmpfile',
        });
      } catch {
        imageUri = null;
      }
      if (mode === 'copy') {
        const maybeNavigator = globalThis as {
          navigator?: {
            clipboard?: { writeText?: (value: string) => Promise<void> };
          };
        };
        if (maybeNavigator.navigator?.clipboard?.writeText) {
          await maybeNavigator.navigator.clipboard.writeText(link.url);
        } else {
          await shareReferralInvite({
            shareText: link.url,
            url: link.url,
          });
        }
        Alert.alert('', 'קישור ההזמנה לעסק הוכן לשיתוף');
        return;
      }
      if (mode === 'whatsapp') {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(creative.shareText)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          await shareReferralInvite({
            shareText: creative.shareText,
            url: creative.url,
            imageUri,
          });
        }
        return;
      }
      await shareReferralInvite({
        shareText: creative.shareText,
        url: creative.url,
        imageUri,
      });
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו ליצור קישור הפניה עסקי כרגע.');
    } finally {
      setIsShareLoading(false);
    }
  };

  const handleRedeem = async (rewardId: string) => {
    if (!canRedeemBilling) {
      return;
    }
    const store = Platform.OS === 'ios' ? 'apple' : 'google';
    try {
      const prepared = (await prepareRedemption({
        businessId,
        rewardId: rewardId as never,
        store,
      })) as {
        canRedeem?: boolean;
        message?: string;
        applied?: boolean;
        mode?: string;
        offerIdentifier?: string;
        months?: number;
      };
      if (prepared?.canRedeem !== true) {
        Alert.alert('מימוש ההטבה', prepared?.message ?? 'ההטבה עדיין לא זמינה למימוש.');
        return;
      }
      if (store === 'google' && prepared.applied) {
        Alert.alert('מימוש ההטבה', REFERRAL_COPY.rewardActivated);
        return;
      }
      if (
        store === 'apple' &&
        prepared.mode === 'promotional_offer' &&
        typeof prepared.offerIdentifier === 'string'
      ) {
        const identityPlan = billingIdentity?.plan;
        const plan = isBusinessPlan(identityPlan) ? identityPlan : null;
        const identityPeriod = billingIdentity?.billingPeriod;
        const period = isBillingPeriod(identityPeriod) ? identityPeriod : null;
        const packagesForPlan = plan
          ? REVENUECAT_PACKAGE_BY_PLAN_PERIOD[plan]
          : null;
        const packageId =
          packagesForPlan && period ? packagesForPlan[period] : null;
        const appUserId = billingIdentity?.providerAppUserId;
        if (!packageId || !appUserId) {
          Alert.alert(
            'מימוש ההטבה',
            'לא הצלחנו להתחיל את המימוש בחנות. ההטבה נשארה זמינה.'
          );
          return;
        }
        const purchased = await purchasePackage(packageId, {
          appUserId,
          applePromotionalOffer: {
            productIdentifier: '',
            offerIdentifier: prepared.offerIdentifier,
          },
        });
        if (!purchased) {
          Alert.alert(
            'מימוש ההטבה',
            'ההטבה נשארה זמינה. אפשר לנסות שוב אחרי אישור החנות.'
          );
          return;
        }
        await confirmRedemption({
          businessId,
          rewardId: rewardId as never,
          monthsConfirmed: prepared.months ?? 1,
        });
        Alert.alert('מימוש ההטבה', REFERRAL_COPY.rewardActivated);
        return;
      }
      Alert.alert(
        'מימוש ההטבה',
        'המשיכו באישור החנות כדי להפעיל את ההטבה. אם תבטלו, ההטבה תישאר זמינה.'
      );
    } catch {
      Alert.alert('מימוש ההטבה', 'לא הצלחנו להתחיל את המימוש כרגע.');
    }
  };

  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="gift-outline" size={24} color="#1D4ED8" />
        </View>
        <Text style={styles.heroTitle}>{REFERRAL_COPY.hubHeading}</Text>
        <Text style={styles.heroBody}>{REFERRAL_COPY.shareBenefit}</Text>
      </View>
      <View ref={creativeRef} collapsable={false}>
        <ReferralShareCreative
          businessPublicName={businessPublicName}
          code="preview"
          variant="general"
        />
      </View>
      {newestEarned ? (
        <RewardEarnedCelebration
          visible={true}
          months={newestEarned.months}
          mode={newestEarned.status === 'redeemed' ? 'redeemed' : 'earned'}
        />
      ) : null}

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>סיכום ההטבה</Text>
        {isSummaryLoading || !hub ? (
          <View style={styles.summaryLoading}>
            <ActivityIndicator
              color="#2F6BFF"
              accessibilityLabel="טוען סיכום הזמנת עסקים"
            />
          </View>
        ) : (
          <View
            style={[
              styles.summaryGrid,
              isTablet ? styles.summaryGridTablet : styles.summaryGridPhone,
            ]}
          >
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {hub.metrics.monthsEarned}
              </Text>
              <Text style={styles.summaryLabel}>חודשים שנצברו</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {hub.metrics.monthsPending}
              </Text>
              <Text style={styles.summaryLabel}>חודשים בהמתנה</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {hub.metrics.monthsRedeemed}
              </Text>
              <Text style={styles.summaryLabel}>חודשים שמומשו</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actionsCard}>
        <Pressable
          onPress={() => void handleShare('native')}
          disabled={isShareLoading || isSwitchingBusiness}
          accessibilityRole="button"
          accessibilityLabel={REFERRAL_COPY.inviteCta}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.pressed : null,
            isShareLoading || isSwitchingBusiness
              ? styles.buttonDisabled
              : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{REFERRAL_COPY.inviteCta}</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleShare('whatsapp')}
          disabled={isShareLoading || isSwitchingBusiness}
          accessibilityRole="button"
          accessibilityLabel="שיתוף הזמנת עסק ב-WhatsApp"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.pressed : null,
            isShareLoading || isSwitchingBusiness
              ? styles.buttonDisabled
              : null,
          ]}
        >
          {isShareLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>שיתוף ב-WhatsApp</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => void handleShare('copy')}
          disabled={isShareLoading || isSwitchingBusiness}
          accessibilityRole="button"
          accessibilityLabel="העתקת קישור להזמנת עסק"
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null,
            isShareLoading || isSwitchingBusiness
              ? styles.buttonDisabled
              : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>העתקת קישור</Text>
        </Pressable>
      </View>
      {hub?.history?.length ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>היסטוריית הזמנות</Text>
          {hub.history.map(
            (row: {
              id: string;
              publicName: string;
              status: string;
              paidMonthsConfirmed: number;
              requiredMonths: number;
            }) => (
              <View key={row.id} style={styles.historyRow}>
                <Text style={styles.historyName}>{row.publicName}</Text>
                <Text style={styles.historyMeta}>
                  {qualificationProgressLabel(
                    row.paidMonthsConfirmed,
                    row.requiredMonths
                  )}
                </Text>
                <Text style={styles.historyMeta}>
                  {referralStatusLabel(row.status)}
                </Text>
              </View>
            )
          )}
        </View>
      ) : null}
      {hub?.rewards?.length ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>ארנק הטבות</Text>
          {hub.rewards.map(
            (row: { id: string; months: number; status: string }) => (
              <View key={row.id} style={styles.historyRow}>
                <Text style={styles.historyName}>
                  {earnedRewardLabel(row.months)}
                </Text>
                <Text style={styles.historyMeta}>
                  {referralStatusLabel(row.status)}
                </Text>
                {canRedeemBilling &&
                (row.status === 'redeemable' || row.status === 'earned') ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={REFERRAL_COPY.redeemCta}
                    onPress={() => {
                      void handleRedeem(row.id);
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {REFERRAL_COPY.redeemCta}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          )}
        </View>
      ) : null}
    </>
  );
}

export default function BusinessInviteBusinessesScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const {
    activeBusiness,
    activeBusinessId,
    isLoading,
    isSwitchingBusiness,
  } = useActiveBusiness();
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canInviteBusinesses = capabilities?.invite_businesses === true;

  if (activeBusiness && !canInviteBusinesses) {
    return <Redirect href="/(authenticated)/(business)/settings" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <BusinessSettingsSubpageHeader
          title="הזמנת עסקים"
          subtitle={REFERRAL_COPY.hubHeading}
          fallbackHref={BUSINESS_ROUTES.settings}
        />

        {isLoading || !activeBusinessId ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <BusinessInviteContent
            key={String(activeBusinessId)}
            businessId={activeBusinessId}
            businessPublicName={activeBusiness?.name ?? 'StampAix'}
            isTablet={width >= 768}
            isSwitchingBusiness={isSwitchingBusiness}
            canRedeemBilling={capabilities?.manage_subscription === true}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
    ...rtlBaseView,
  },
  content: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CFE0FF',
    backgroundColor: '#F8FAFF',
    padding: 18,
    alignItems: alignItems.start,
    gap: 8,
    ...rtlBaseView,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F0FF',
  },
  heroTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE8FF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    ...rtlBaseView,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryGrid: {
    gap: 8,
  },
  summaryGridPhone: {
    flexDirection: flexDirection.col,
  },
  summaryGridTablet: {
    flexDirection: flexDirection.row,
  },
  summaryItem: {
    flex: 1,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: alignItems.start,
    justifyContent: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#1230A8',
    textAlign: 'right',
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryLoading: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE8FF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  loadingCard: {
    minHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE8FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    gap: 4,
  },
  historyName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  historyMeta: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
