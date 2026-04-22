import { useMutation, useQuery } from 'convex/react';
import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
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
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const TEXT = {
  title: 'Referral Admin',
  searchSection: 'Search / Filters',
  linksSection: 'Customer Referral Links',
  referralsSection: 'Referral Records',
  rewardsSection: 'Referral Rewards',
  auditSection: 'Audit Log',
  loading: 'Loading...',
  empty: 'No records found.',
  disableLink: 'Disable Link',
  revokeReward: 'Revoke Reward',
  markInvalid: 'Mark Invalid',
  reasonCode: 'Reason code',
  reasonNote: 'Reason note',
  referralCode: 'Referral code',
  businessId: 'Business ID',
  customerReferralId: 'Customer referral ID',
  rewardId: 'Reward ID',
};

function formatTimestamp(value?: number) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function asString(value: unknown) {
  if (value == null) {
    return '-';
  }
  return String(value);
}

function isLinkDisabled(status: unknown) {
  return String(status) !== 'active';
}

function isReferralInvalid(status: unknown) {
  return String(status) === 'invalid';
}

function isRewardRevokedOrRedeemed(status: unknown) {
  const normalized = String(status);
  return normalized === 'revoked' || normalized === 'redeemed';
}

export default function AdminReferralsScreen() {
  const insets = useSafeAreaInsets();
  const sessionContext = useSessionContext();
  const isAdmin = sessionContext?.isAdmin === true;

  const [referralCode, setReferralCode] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [customerReferralId, setCustomerReferralId] = useState('');
  const [rewardId, setRewardId] = useState('');
  const [reasonCode, setReasonCode] = useState('manual_admin_action');
  const [reasonNote, setReasonNote] = useState('');
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);

  const linkSearchNeedle = useMemo(
    () => referralCode.trim() || businessId.trim() || '',
    [referralCode, businessId]
  );
  const referralSearchNeedle = useMemo(
    () => customerReferralId.trim() || businessId.trim() || '',
    [customerReferralId, businessId]
  );
  const rewardSearchNeedle = useMemo(
    () => rewardId.trim() || businessId.trim() || '',
    [rewardId, businessId]
  );
  const auditTargetId = useMemo(
    () => rewardId.trim() || customerReferralId.trim() || '',
    [rewardId, customerReferralId]
  );

  const customerLinkRows = useQuery(
    api.referrals.adminSearchReferralRecords,
    isAdmin
      ? {
          query: linkSearchNeedle,
          type: 'customerReferralLink',
          limit: 80,
        }
      : 'skip'
  );
  const customerReferralRows = useQuery(
    api.referrals.adminSearchReferralRecords,
    isAdmin
      ? {
          query: referralSearchNeedle,
          type: 'customerReferral',
          limit: 80,
        }
      : 'skip'
  );
  const rewardRows = useQuery(
    api.referrals.adminSearchReferralRecords,
    isAdmin
      ? {
          query: rewardSearchNeedle,
          type: 'referralReward',
          limit: 80,
        }
      : 'skip'
  );
  const auditRows = useQuery(
    api.referrals.adminListReferralAuditLog,
    isAdmin
      ? {
          targetId: auditTargetId || undefined,
          limit: 120,
        }
      : 'skip'
  );

  const disableReferralLink = useMutation(
    api.referrals.adminDisableCustomerReferralLink
  );
  const markReferralInvalid = useMutation(
    api.referrals.adminMarkCustomerReferralInvalid
  );
  const revokeReferralReward = useMutation(
    api.referrals.adminRevokeReferralReward
  );

  const safeReasonCode = reasonCode.trim() || 'manual_admin_action';
  const safeReasonNote = reasonNote.trim() || 'manual admin action';

  const runAction = async (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    try {
      setPendingActionKey(key);
      await action();
      Alert.alert('', successMessage);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Action failed'
      );
    } finally {
      setPendingActionKey(null);
    }
  };

  if (sessionContext === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#2F6BFF" />
          <Text style={styles.loadingText}>{TEXT.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 10}
          backgroundColor="#F2F4F8"
          style={styles.header}
        >
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>{TEXT.title}</Text>
        </StickyScrollHeader>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{TEXT.searchSection}</Text>
          <TextInput
            value={referralCode}
            onChangeText={setReferralCode}
            style={styles.input}
            placeholder={TEXT.referralCode}
            autoCapitalize="characters"
          />
          <TextInput
            value={businessId}
            onChangeText={setBusinessId}
            style={styles.input}
            placeholder={TEXT.businessId}
            autoCapitalize="none"
          />
          <TextInput
            value={customerReferralId}
            onChangeText={setCustomerReferralId}
            style={styles.input}
            placeholder={TEXT.customerReferralId}
            autoCapitalize="none"
          />
          <TextInput
            value={rewardId}
            onChangeText={setRewardId}
            style={styles.input}
            placeholder={TEXT.rewardId}
            autoCapitalize="none"
          />
          <TextInput
            value={reasonCode}
            onChangeText={setReasonCode}
            style={styles.input}
            placeholder={TEXT.reasonCode}
            autoCapitalize="none"
          />
          <TextInput
            value={reasonNote}
            onChangeText={setReasonNote}
            style={[styles.input, styles.multilineInput]}
            placeholder={TEXT.reasonNote}
            multiline={true}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{TEXT.linksSection}</Text>
          {customerLinkRows === undefined ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : customerLinkRows.length === 0 ? (
            <Text style={styles.emptyText}>{TEXT.empty}</Text>
          ) : (
            customerLinkRows.map((row) => {
              const payload = row.payload as {
                _id: Id<'customerReferralLinks'>;
                code?: string;
                businessId?: string;
                referrerUserId?: string;
                status?: string;
              };
              const actionKey = `disable:${String(payload._id)}`;
              const disabled =
                pendingActionKey === actionKey ||
                isLinkDisabled(payload.status);
              return (
                <View key={row.targetId} style={styles.itemCard}>
                  <Text style={styles.itemLine}>
                    code: {asString(payload.code)}
                  </Text>
                  <Text style={styles.itemLine}>
                    business: {asString(payload.businessId)}
                  </Text>
                  <Text style={styles.itemLine}>
                    referrer: {asString(payload.referrerUserId)}
                  </Text>
                  <Text style={styles.itemLine}>
                    status: {asString(payload.status)}
                  </Text>
                  <Pressable
                    disabled={disabled}
                    onPress={() =>
                      void runAction(
                        actionKey,
                        async () =>
                          disableReferralLink({
                            referralLinkId: payload._id,
                            reasonCode: safeReasonCode,
                            reasonNote: safeReasonNote,
                          }),
                        'Link disabled'
                      )
                    }
                    style={({ pressed }) => [
                      styles.actionButton,
                      pressed ? styles.pressed : null,
                      disabled ? styles.actionButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.actionButtonText}>
                      {TEXT.disableLink}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{TEXT.referralsSection}</Text>
          {customerReferralRows === undefined ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : customerReferralRows.length === 0 ? (
            <Text style={styles.emptyText}>{TEXT.empty}</Text>
          ) : (
            customerReferralRows.map((row) => {
              const payload = row.payload as {
                _id: Id<'customerReferrals'>;
                referredUserId?: string;
                referrerUserId?: string;
                status?: string;
              };
              const actionKey = `invalid:${String(payload._id)}`;
              const disabled =
                pendingActionKey === actionKey ||
                isReferralInvalid(payload.status);
              return (
                <View key={row.targetId} style={styles.itemCard}>
                  <Text style={styles.itemLine}>
                    referred: {asString(payload.referredUserId)}
                  </Text>
                  <Text style={styles.itemLine}>
                    referrer: {asString(payload.referrerUserId)}
                  </Text>
                  <Text style={styles.itemLine}>
                    status: {asString(payload.status)}
                  </Text>
                  <Pressable
                    disabled={disabled}
                    onPress={() =>
                      void runAction(
                        actionKey,
                        async () =>
                          markReferralInvalid({
                            customerReferralId: payload._id,
                            reasonCode: safeReasonCode,
                            reasonNote: safeReasonNote,
                          }),
                        'Referral marked invalid'
                      )
                    }
                    style={({ pressed }) => [
                      styles.actionButton,
                      pressed ? styles.pressed : null,
                      disabled ? styles.actionButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.actionButtonText}>
                      {TEXT.markInvalid}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{TEXT.rewardsSection}</Text>
          {rewardRows === undefined ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : rewardRows.length === 0 ? (
            <Text style={styles.emptyText}>{TEXT.empty}</Text>
          ) : (
            rewardRows.map((row) => {
              const payload = row.payload as {
                _id: Id<'referralRewards'>;
                recipientUserId?: string;
                actualRewardType?: string;
                status?: string;
              };
              const actionKey = `revoke:${String(payload._id)}`;
              const disabled =
                pendingActionKey === actionKey ||
                isRewardRevokedOrRedeemed(payload.status);
              return (
                <View key={row.targetId} style={styles.itemCard}>
                  <Text style={styles.itemLine}>
                    recipient: {asString(payload.recipientUserId)}
                  </Text>
                  <Text style={styles.itemLine}>
                    reward type: {asString(payload.actualRewardType)}
                  </Text>
                  <Text style={styles.itemLine}>
                    status: {asString(payload.status)}
                  </Text>
                  <Pressable
                    disabled={disabled}
                    onPress={() =>
                      void runAction(
                        actionKey,
                        async () =>
                          revokeReferralReward({
                            referralRewardId: payload._id,
                            reasonCode: safeReasonCode,
                            reasonNote: safeReasonNote,
                          }),
                        'Reward revoked'
                      )
                    }
                    style={({ pressed }) => [
                      styles.actionButton,
                      pressed ? styles.pressed : null,
                      disabled ? styles.actionButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.actionButtonText}>
                      {TEXT.revokeReward}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{TEXT.auditSection}</Text>
          {auditRows === undefined ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : auditRows.length === 0 ? (
            <Text style={styles.emptyText}>{TEXT.empty}</Text>
          ) : (
            auditRows.map((row: any) => (
              <View key={String(row._id)} style={styles.itemCard}>
                <Text style={styles.itemLine}>
                  actor: {asString(row.actorAdminUserId)}
                </Text>
                <Text style={styles.itemLine}>
                  action: {asString(row.action)}
                </Text>
                <Text style={styles.itemLine}>
                  reason: {asString(row.reasonCode)} /{' '}
                  {asString(row.reasonNote)}
                </Text>
                <Text style={styles.itemLine}>
                  timestamp: {formatTimestamp(row.createdAt)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
  content: {
    paddingHorizontal: 18,
    gap: 12,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DFE5EF',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  input: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4DCE8',
    backgroundColor: '#FAFBFD',
    paddingHorizontal: 12,
    textAlign: 'right',
    color: '#111827',
    fontWeight: '600',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'right',
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 10,
    gap: 4,
  },
  itemLine: {
    fontSize: 12,
    lineHeight: 18,
    color: '#334155',
    fontWeight: '600',
    textAlign: 'right',
  },
  actionButton: {
    marginTop: 4,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.88,
  },
});
