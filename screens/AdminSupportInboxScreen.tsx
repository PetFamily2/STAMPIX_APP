import { Ionicons } from '@expo/vector-icons';
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

import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const TEXT = {
  title:
    '\u05e4\u05e0\u05d9\u05d5\u05ea \u05e9\u05d9\u05e8\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  noAccess:
    '\u05d4\u05de\u05e1\u05da \u05d6\u05de\u05d9\u05df \u05dc\u05d0\u05d3\u05de\u05d9\u05df \u05d1\u05dc\u05d1\u05d3.',
  emptyTitle:
    '\u05d0\u05d9\u05df \u05e4\u05e0\u05d9\u05d5\u05ea \u05d7\u05d3\u05e9\u05d5\u05ea',
  emptySubtitle:
    '\u05db\u05e9\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d9\u05e9\u05dc\u05d7\u05d5 \u05d4\u05d5\u05d3\u05e2\u05d4 \u05de\u05de\u05e1\u05da \u05d4\u05e2\u05d6\u05e8\u05d4, \u05d4\u05d9\u05d0 \u05ea\u05d5\u05e4\u05d9\u05e2 \u05db\u05d0\u05df.',
  statusNew: '\u05d7\u05d3\u05e9',
  statusHandled: '\u05d8\u05d5\u05e4\u05dc',
  markHandled: '\u05e1\u05de\u05df \u05db\u05d8\u05d5\u05e4\u05dc',
  markNew: '\u05d4\u05d7\u05d6\u05e8 \u05dc\u05d7\u05d3\u05e9',
  fullName: '\u05e9\u05dd',
  email: '\u05d0\u05d9\u05de\u05d9\u05d9\u05dc',
  phone: '\u05d8\u05dc\u05e4\u05d5\u05df',
  sentAt: '\u05e0\u05e9\u05dc\u05d7 \u05d1-',
  unknown: '\u05dc\u05d0 \u05d4\u05d5\u05d2\u05d3\u05e8',
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
  updateFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e2\u05d3\u05db\u05df \u05d0\u05ea \u05e1\u05d8\u05d8\u05d5\u05e1 \u05d4\u05e4\u05e0\u05d9\u05d9\u05d4.',
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
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color="#111827" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.pageTitle}>{TEXT.title}</Text>
          </View>
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

                  <Text style={styles.requestTimestamp}>
                    {TEXT.sentAt} {formatTimestamp(request.createdAt)}
                  </Text>
                </View>

                <View style={styles.detailList}>
                  <Text style={styles.detailLine}>
                    {TEXT.fullName}: {request.name || TEXT.unknown}
                  </Text>
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
    paddingHorizontal: 20,
    gap: 16,
  },
  pressed: { opacity: 0.88 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  requestHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  requestTimestamp: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
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
