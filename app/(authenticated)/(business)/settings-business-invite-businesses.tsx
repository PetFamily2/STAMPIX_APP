import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

function BusinessInviteContent({
  businessId,
  isTablet,
  isSwitchingBusiness,
}: {
  businessId: Id<'businesses'>;
  isTablet: boolean;
  isSwitchingBusiness: boolean;
}) {
  const createBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );
  const summary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    isSwitchingBusiness ? 'skip' : { businessId }
  );
  const [isShareLoading, setIsShareLoading] = useState(false);
  const isSummaryLoading = isSwitchingBusiness || summary == null;

  const handleShare = async (mode: 'whatsapp' | 'copy') => {
    if (isSwitchingBusiness || isShareLoading) {
      return;
    }
    try {
      setIsShareLoading(true);
      const link = await createBusinessReferralLink({ businessId });
      const message = `הזמינו בעלי עסקים ל-StampAix וקבלו חודשי מנוי מתנה.\n${link.url}`;

      if (mode === 'whatsapp') {
        const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          await Share.share({ message });
        }
      } else {
        const maybeNavigator = globalThis as {
          navigator?: {
            clipboard?: { writeText?: (value: string) => Promise<void> };
          };
        };
        if (maybeNavigator.navigator?.clipboard?.writeText) {
          await maybeNavigator.navigator.clipboard.writeText(link.url);
        } else {
          await Share.share({ message: link.url });
        }
        Alert.alert('', 'קישור ההזמנה לעסק הוכן לשיתוף');
      }
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו ליצור קישור הפניה עסקי כרגע.');
    } finally {
      setIsShareLoading(false);
    }
  };

  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="gift-outline" size={24} color="#1D4ED8" />
        </View>
        <Text style={styles.heroTitle}>הזמינו עסק וקבלו חודשים מתנה</Text>
        <Text style={styles.heroBody}>
          מכירים בעל עסק שיכול ליהנות מ-StampAix? שתפו אותו וקבלו חודשי שימוש
          חינם כשההפניה מזכה אתכם.
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>סיכום ההטבה</Text>
        {isSummaryLoading || !summary ? (
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
                {summary.creditedMonths}
              </Text>
              <Text style={styles.summaryLabel}>חודשים שהתקבלו</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {summary.pendingMonths}
              </Text>
              <Text style={styles.summaryLabel}>חודשים בהמתנה</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {summary.remainingCapMonths}
              </Text>
              <Text style={styles.summaryLabel}>נותרו עד לתקרה</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actionsCard}>
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
    </>
  );
}

export default function BusinessInviteBusinessesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const canViewBilling = capabilities?.view_billing_state === true;

  if (activeBusiness && !canViewBilling) {
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
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="הזמנת עסקים"
            subtitle="הזמינו בעלי עסקים ל-StampAix וקבלו חודשי שימוש חינם"
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.push('/(authenticated)/(business)/settings')
                }
              />
            }
          />
        </StickyScrollHeader>

        {isLoading || !activeBusinessId ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <BusinessInviteContent
            key={String(activeBusinessId)}
            businessId={activeBusinessId}
            isTablet={width >= 768}
            isSwitchingBusiness={isSwitchingBusiness}
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
});
