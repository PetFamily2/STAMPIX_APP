import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { flexDirection, justifyContent, rtlBaseView } from '@/lib/rtl';

type PlanLimitModalProps = {
  visible: boolean;
  blockedAction: string;
  reason: string;
  currentPlan?: string | null;
  limitSummary?: string | null;
  canManageSubscription: boolean;
  onManageSubscription?: () => void;
  onDismiss: () => void;
};

export function PlanLimitModal({
  visible,
  blockedAction,
  reason,
  currentPlan,
  limitSummary,
  canManageSubscription,
  onManageSubscription,
  onDismiss,
}: PlanLimitModalProps) {
  const insets = useSafeAreaInsets();
  const showManageAction = canManageSubscription && onManageSubscription;

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="סגירת הודעת מגבלת מסלול"
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.iconCanvas}>
              <Ionicons name="lock-closed-outline" size={20} color="#1D4ED8" />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>מגבלת המסלול</Text>
              <Text style={styles.blockedAction}>{blockedAction}</Text>
            </View>
          </View>

          <Text style={styles.reason}>{reason}</Text>

          {currentPlan || limitSummary ? (
            <View style={styles.summaryCard}>
              {currentPlan ? (
                <Text style={styles.summaryText}>
                  מסלול נוכחי: {currentPlan}
                </Text>
              ) : null}
              {limitSummary ? (
                <Text style={styles.summaryText}>{limitSummary}</Text>
              ) : null}
            </View>
          ) : null}

          {!showManageAction ? (
            <Text style={styles.ownerHint}>
              רק בעלי העסק יכולים לנהל את המסלול. אפשר לפנות לבעלי העסק לקבלת
              עזרה.
            </Text>
          ) : null}

          {showManageAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="מעבר לניהול המסלול"
              onPress={onManageSubscription}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>ניהול המסלול</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="סגירה"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>סגירה</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: justifyContent.start,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  sheet: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#D7E2F4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  iconCanvas: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 2,
  },
  title: {
    color: '#0F172A',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  blockedAction: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reason: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E2F4',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  summaryText: {
    color: '#1E3A8A',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ownerHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.86,
  },
});
