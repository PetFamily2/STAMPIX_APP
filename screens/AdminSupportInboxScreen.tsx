import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { alignItems, flexDirection, selfEnd } from '@/lib/rtl';

const TEXT = {
  title: 'פניות שירות לקוחות',
  noAccess: 'המסך זמין לאדמין בלבד.',
  emptyTitle: 'אין פניות חדשות',
  emptySubtitle: 'כשלקוחות ישלחו הודעה ממסך העזרה, היא תופיע כאן.',
  statusNew: 'חדש',
  statusHandled: 'טופל',
  markHandled: 'סמן כטופל',
  markNew: 'החזר לחדש',
  email: 'אימייל',
  phone: 'טלפון',
  sentAt: 'נשלח ב-',
  unknown: 'לא הוגדר',
  errorTitle: 'שגיאה',
  updateFailed: 'לא הצלחנו לעדכן את סטטוס הפנייה.',
};

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export default function AdminSupportInboxScreen() {
  const insets = useSafeAreaInsets();
  const sessionContext = useSessionContext();
  const isAdmin = sessionContext?.isAdmin === true;
  const requests = useQuery(
    api.support.listSupportRequests,
    isAdmin ? {} : 'skip'
  );
  const setSupportRequestStatus = useMutation(
    api.support.setSupportRequestStatus
  );
  const [updatingId, setUpdatingId] = useState<Id<'supportRequests'> | null>(
    null
  );

  const handleToggleStatus = async (
    requestId: Id<'supportRequests'>,
    status: 'new' | 'handled'
  ) => {
    try {
      setUpdatingId(requestId);
      await setSupportRequestStatus({
        requestId,
        status: status === 'new' ? 'handled' : 'new',
      });
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.updateFailed);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 8}
          backgroundColor="#F3F3F1"
          style={styles.headerRow}
        >
          <StandaloneBackTitleHeader
            title={TEXT.title}
            onBackPress={() => router.back()}
            titleStyle={styles.pageTitle}
          />
        </StickyScrollHeader>

        {!isAdmin ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{TEXT.noAccess}</Text>
          </View>
        ) : requests === undefined ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{TEXT.emptySubtitle}</Text>
          </View>
        ) : (
          requests.map((request) => {
            const isUpdating = updatingId === request._id;
            const isHandled = request.status === 'handled';

            return (
              <View key={request._id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestIdentity}>
                    <Text style={styles.requestName}>
                      {request.name || TEXT.unknown}
                    </Text>
                    <Text style={styles.requestTimestamp}>
                      {TEXT.sentAt} {formatTimestamp(request.createdAt)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      isHandled
                        ? styles.statusChipHandled
                        : styles.statusChipNew,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusChipText,
                        isHandled
                          ? styles.statusChipTextHandled
                          : styles.statusChipTextNew,
                      ]}
                    >
                      {isHandled ? TEXT.statusHandled : TEXT.statusNew}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailList}>
                  <Text style={styles.detailLine}>
                    {TEXT.email}: {request.email || TEXT.unknown}
                  </Text>
                  <Text style={styles.detailLine}>
                    {TEXT.phone}: {request.phone || TEXT.unknown}
                  </Text>
                </View>

                <Text style={styles.messageText}>{request.message}</Text>

                <Pressable
                  onPress={() =>
                    handleToggleStatus(request._id, request.status)
                  }
                  disabled={isUpdating}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isHandled ? TEXT.markNew : TEXT.markHandled
                  }
                  accessibilityState={{ disabled: isUpdating }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed ? styles.pressed : null,
                    isUpdating ? styles.actionButtonDisabled : null,
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#111827" />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      {isHandled ? TEXT.markNew : TEXT.markHandled}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F3F1' },
  scrollContent: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  pressed: { opacity: 0.88 },

  headerRow: {
    width: '100%',
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
  },

  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
  },
  emptySubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },

  requestCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  requestHeader: {
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  requestTimestamp: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
  },
  requestIdentity: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 2,
  },
  requestName: {
    width: '100%',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
    color: '#18181B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipNew: {
    backgroundColor: '#EEF4FF',
  },
  statusChipHandled: {
    backgroundColor: '#ECFDF3',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusChipTextNew: {
    color: '#245DDE',
  },
  statusChipTextHandled: {
    color: '#027A48',
  },
  detailList: {
    gap: 4,
  },
  detailLine: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'right',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    color: '#18181B',
    textAlign: 'right',
  },
  actionButton: {
    minHeight: 44,
    minWidth: 140,
    alignSelf: selfEnd,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
});
