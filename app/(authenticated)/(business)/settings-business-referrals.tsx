import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
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
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';

type RewardType = 'STAMP' | 'BENEFIT';
type RewardRecipients = 'referrer' | 'referred' | 'both';
type MonthlyLimit = 'unlimited' | 5 | 10 | 20 | 50;
type BenefitExpiration = 14 | 30 | 60 | 90;

const MONTHLY_LIMIT_OPTIONS: MonthlyLimit[] = ['unlimited', 5, 10, 20, 50];
const BENEFIT_EXPIRATION_OPTIONS: BenefitExpiration[] = [14, 30, 60, 90];

export default function BusinessReferralSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;

  const canViewSettings = capabilities?.view_settings === true;
  const canEditConfig = capabilities?.edit_loyalty_cards === true;
  const canViewDashboard = capabilities?.access_dashboard === true;
  const canViewCustomers = capabilities?.access_customers === true;
  const canViewBilling = capabilities?.view_billing_state === true;

  const configQuery = useQuery(
    api.referrals.getReferralConfig,
    activeBusinessId && canViewSettings ? { businessId: activeBusinessId } : 'skip'
  );
  const dashboardQuery = useQuery(
    api.referrals.getBusinessReferralDashboard,
    activeBusinessId && canViewDashboard
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const performanceQuery = useQuery(
    api.referrals.getBusinessReferralPerformance,
    activeBusinessId && canViewDashboard
      ? { businessId: activeBusinessId, range: '30d' }
      : 'skip'
  );
  const customersQuery = useQuery(
    api.referrals.listBusinessReferralCustomers,
    activeBusinessId && canViewCustomers
      ? { businessId: activeBusinessId, limit: 40 }
      : 'skip'
  );
  const rewardsQuery = useQuery(
    api.referrals.listBusinessReferralRewards,
    activeBusinessId && canViewCustomers
      ? { businessId: activeBusinessId, limit: 40 }
      : 'skip'
  );
  const b2bSummary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    activeBusinessId && canViewBilling
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const saveReferralConfig = useMutation(api.referrals.saveReferralConfig);
  const getOrCreateBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );

  const [isEnabled, setIsEnabled] = useState(true);
  const [rewardType, setRewardType] = useState<RewardType>('STAMP');
  const [rewardValueText, setRewardValueText] = useState('1');
  const [benefitTitle, setBenefitTitle] = useState('');
  const [benefitDescription, setBenefitDescription] = useState('');
  const [benefitExpirationDays, setBenefitExpirationDays] =
    useState<BenefitExpiration>(30);
  const [rewardRecipients, setRewardRecipients] =
    useState<RewardRecipients>('both');
  const [monthlyLimit, setMonthlyLimit] = useState<MonthlyLimit>(10);
  const [isSaving, setIsSaving] = useState(false);
  const [isB2bShareLoading, setIsB2bShareLoading] = useState(false);

  useEffect(() => {
    if (!configQuery) {
      return;
    }
    setIsEnabled(configQuery.isEnabled === true);
    setRewardType(configQuery.rewardType === 'BENEFIT' ? 'BENEFIT' : 'STAMP');
    setRewardValueText(
      String(Math.max(1, Number(configQuery.rewardValue ?? 1)))
    );
    setBenefitTitle(configQuery.benefitTitle ?? '');
    setBenefitDescription(configQuery.benefitDescription ?? '');
    setBenefitExpirationDays(
      configQuery.benefitExpirationDays === 14 ||
        configQuery.benefitExpirationDays === 30 ||
        configQuery.benefitExpirationDays === 60 ||
        configQuery.benefitExpirationDays === 90
        ? configQuery.benefitExpirationDays
        : 30
    );
    setRewardRecipients(configQuery.rewardRecipients ?? 'both');
    setMonthlyLimit(
      configQuery.monthlyLimit === 'unlimited' ||
        configQuery.monthlyLimit === 5 ||
        configQuery.monthlyLimit === 10 ||
        configQuery.monthlyLimit === 20 ||
        configQuery.monthlyLimit === 50
        ? configQuery.monthlyLimit
        : 10
    );
  }, [configQuery]);

  const rewardValue = useMemo(() => {
    const parsed = Number.parseInt(rewardValueText, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1;
    }
    return parsed;
  }, [rewardValueText]);

  const handleSaveConfig = async () => {
    if (!activeBusinessId || !canEditConfig || isSaving) {
      return;
    }
    try {
      setIsSaving(true);
      await saveReferralConfig({
        businessId: activeBusinessId,
        isEnabled,
        rewardType,
        rewardValue,
        benefitTitle: benefitTitle.trim() || undefined,
        benefitDescription: benefitDescription.trim() || undefined,
        benefitExpirationDays:
          rewardType === 'BENEFIT' ? benefitExpirationDays : undefined,
        rewardRecipients,
        monthlyLimit,
      });
      Alert.alert('', 'הגדרות ההזמנות נשמרו');
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לשמור את הגדרות ההזמנות');
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareBusinessReferral = async (mode: 'whatsapp' | 'copy') => {
    if (!activeBusinessId || !canViewBilling || isB2bShareLoading) {
      return;
    }
    try {
      setIsB2bShareLoading(true);
      const link = await getOrCreateBusinessReferralLink({
        businessId: activeBusinessId,
      });
      const message = `Invite your business network to StampAix and earn free subscription months.\n${link.url}`;

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
        Alert.alert('', 'קישור ההזמנה מוכן לשיתוף');
      }
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו ליצור קישור הזמנה לעסק');
    } finally {
      setIsB2bShareLoading(false);
    }
  };

  if (activeBusiness && !canViewSettings) {
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
            title="הגדרות הזמנות"
            subtitle="קונפיגורציה, ביצועים והטבות הפניה"
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        {configQuery === undefined ? (
          <View style={styles.card}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>קונפיגורציית הזמנות לקוחות</Text>

            <View style={styles.row}>
              <Text style={styles.label}>הפניות פעילות</Text>
              <Pressable
                onPress={() => canEditConfig && setIsEnabled((value) => !value)}
                disabled={!canEditConfig}
                style={[
                  styles.toggle,
                  isEnabled ? styles.toggleOn : styles.toggleOff,
                ]}
              >
                <Text style={styles.toggleText}>
                  {isEnabled ? 'פעיל' : 'כבוי'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>סוג תגמול</Text>
            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => canEditConfig && setRewardType('STAMP')}
                style={[
                  styles.segmentButton,
                  rewardType === 'STAMP' ? styles.segmentButtonActive : null,
                ]}
              >
                <Text style={styles.segmentText}>STAMP</Text>
              </Pressable>
              <Pressable
                onPress={() => canEditConfig && setRewardType('BENEFIT')}
                style={[
                  styles.segmentButton,
                  rewardType === 'BENEFIT' ? styles.segmentButtonActive : null,
                ]}
              >
                <Text style={styles.segmentText}>BENEFIT</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>כמות תגמול</Text>
            <TextInput
              value={rewardValueText}
              onChangeText={setRewardValueText}
              keyboardType="number-pad"
              editable={canEditConfig}
              style={styles.input}
            />

            {rewardType === 'BENEFIT' ? (
              <>
                <Text style={styles.label}>כותרת הטבה</Text>
                <TextInput
                  value={benefitTitle}
                  onChangeText={setBenefitTitle}
                  editable={canEditConfig}
                  style={styles.input}
                />

                <Text style={styles.label}>תיאור הטבה</Text>
                <TextInput
                  value={benefitDescription}
                  onChangeText={setBenefitDescription}
                  editable={canEditConfig}
                  multiline={true}
                  style={[styles.input, styles.multilineInput]}
                />

                <Text style={styles.label}>תוקף הטבה (ימים)</Text>
                <View style={styles.segmentRow}>
                  {BENEFIT_EXPIRATION_OPTIONS.map((value) => (
                    <Pressable
                      key={String(value)}
                      onPress={() =>
                        canEditConfig && setBenefitExpirationDays(value)
                      }
                      style={[
                        styles.segmentButtonCompact,
                        benefitExpirationDays === value
                          ? styles.segmentButtonActive
                          : null,
                      ]}
                    >
                      <Text style={styles.segmentText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.label}>מקבלי תגמול</Text>
            <View style={styles.segmentRow}>
              <Pressable
                onPress={() => canEditConfig && setRewardRecipients('referrer')}
                style={[
                  styles.segmentButtonCompact,
                  rewardRecipients === 'referrer'
                    ? styles.segmentButtonActive
                    : null,
                ]}
              >
                <Text style={styles.segmentText}>מזמין</Text>
              </Pressable>
              <Pressable
                onPress={() => canEditConfig && setRewardRecipients('referred')}
                style={[
                  styles.segmentButtonCompact,
                  rewardRecipients === 'referred'
                    ? styles.segmentButtonActive
                    : null,
                ]}
              >
                <Text style={styles.segmentText}>מוזמן</Text>
              </Pressable>
              <Pressable
                onPress={() => canEditConfig && setRewardRecipients('both')}
                style={[
                  styles.segmentButtonCompact,
                  rewardRecipients === 'both'
                    ? styles.segmentButtonActive
                    : null,
                ]}
              >
                <Text style={styles.segmentText}>שניהם</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>מגבלה חודשית למזמין</Text>
            <View style={styles.segmentRow}>
              {MONTHLY_LIMIT_OPTIONS.map((limit) => (
                <Pressable
                  key={String(limit)}
                  onPress={() => canEditConfig && setMonthlyLimit(limit)}
                  style={[
                    styles.segmentButtonCompact,
                    monthlyLimit === limit ? styles.segmentButtonActive : null,
                  ]}
                >
                  <Text style={styles.segmentText}>
                    {limit === 'unlimited' ? '∞' : String(limit)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => void handleSaveConfig()}
              disabled={!canEditConfig || isSaving}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null,
                !canEditConfig || isSaving ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSaving ? 'שומר...' : 'שמירת הגדרות'}
              </Text>
            </Pressable>
          </View>
        )}

        {dashboardQuery ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>מדדי הפניות (30 ימים)</Text>
            <Text style={styles.metricLine}>
              נוצרו: {dashboardQuery.referralsGenerated}
            </Text>
            <Text style={styles.metricLine}>
              הושלמו: {dashboardQuery.referralsCompleted}
            </Text>
            <Text style={styles.metricLine}>
              תגמולים הוענקו: {dashboardQuery.rewardsGranted}
            </Text>
            <Text style={styles.metricLine}>
              תגמולים מומשו: {dashboardQuery.rewardsRedeemed}
            </Text>
            <Text style={styles.metricLine}>
              הטבות פעילות להמתנה: {dashboardQuery.activeBenefits}
            </Text>
            <Text style={styles.metricLine}>
              חודשי זיכוי B2B: {dashboardQuery.b2bFreeMonthsEarned}
            </Text>
            {performanceQuery ? (
              <Text style={styles.metricHint}>
                הצטרפו דרך לינק: {performanceQuery.referralsJoined} · Qualified:{' '}
                {performanceQuery.referralsQualified}
              </Text>
            ) : null}
          </View>
        ) : null}

        {canViewBilling ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Business Referral (B2B)</Text>
            <Text style={styles.metricLine}>
              חודשי זיכוי שנצברו: {b2bSummary?.creditedMonths ?? 0}
            </Text>
            <Text style={styles.metricLine}>
              חודשי זיכוי בהמתנה: {b2bSummary?.pendingMonths ?? 0}
            </Text>
            <Text style={styles.metricLine}>
              יתרה עד תקרה: {b2bSummary?.remainingCapMonths ?? 24}
            </Text>
            <View style={styles.actionsRow}>
              <Pressable
                onPress={() => void handleShareBusinessReferral('whatsapp')}
                disabled={isB2bShareLoading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.actionButton,
                  pressed ? styles.pressed : null,
                  isB2bShareLoading ? styles.buttonDisabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isB2bShareLoading ? 'טוען...' : 'שיתוף ב-WhatsApp'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleShareBusinessReferral('copy')}
                disabled={isB2bShareLoading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.actionButton,
                  pressed ? styles.pressed : null,
                  isB2bShareLoading ? styles.buttonDisabled : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>העתקת קישור</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {canViewCustomers ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>לקוחות שהצטרפו דרך הפניה</Text>
            {(customersQuery ?? []).length === 0 ? (
              <Text style={styles.emptyText}>אין נתוני הפניות עדיין</Text>
            ) : (
              (customersQuery ?? []).slice(0, 8).map((row) => (
                <View key={String(row.referralId)} style={styles.listRow}>
                  <Text style={styles.listPrimary}>
                    {row.referredName ?? row.referredUserId}
                  </Text>
                  <Text style={styles.listSecondary}>
                    מזמין: {row.referrerName ?? row.referrerUserId} ·{' '}
                    {row.status}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {canViewCustomers ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>תגמולים שהונפקו</Text>
            {(rewardsQuery ?? []).length === 0 ? (
              <Text style={styles.emptyText}>אין תגמולים להצגה</Text>
            ) : (
              (rewardsQuery ?? []).slice(0, 8).map((row) => (
                <View key={String(row.rewardId)} style={styles.listRow}>
                  <Text style={styles.listPrimary}>
                    {row.recipientName ?? row.recipientUserId}
                  </Text>
                  <Text style={styles.listSecondary}>
                    {row.actualRewardType} · {row.status}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  content: {
    paddingHorizontal: 20,
    gap: 10,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DDE8FF',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  toggle: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  toggleOn: {
    borderColor: '#9EDDB9',
    backgroundColor: '#EAFBF1',
  },
  toggleOff: {
    borderColor: '#F9CACA',
    backgroundColor: '#FFF1F1',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    minWidth: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F6F9FF',
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F6F9FF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    borderColor: '#AFC9FF',
    backgroundColor: '#EAF2FF',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F8FAFF',
    minHeight: 42,
    paddingHorizontal: 12,
    textAlign: 'right',
    fontWeight: '700',
    color: '#0F172A',
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#2F6BFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DEEE',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  metricLine: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  metricHint: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  listRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 4,
  },
  listPrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  listSecondary: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
