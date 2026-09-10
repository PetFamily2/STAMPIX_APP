import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

type LogoutOptionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  onLogoutDevice: () => void;
  onCancelSubscription?: () => void;
  showCancelSubscription: boolean;
};

export function LogoutOptionsSheet({
  visible,
  onClose,
  onLogoutDevice,
  onCancelSubscription,
  showCancelSubscription,
}: LogoutOptionsSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="סגירה"
        style={styles.backdrop}
      >
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>התנתקות</Text>
          <Text style={styles.subtitle}>בחרו את הפעולה הרצויה</Text>

          <Pressable
            onPress={onLogoutDevice}
            accessibilityRole="button"
            accessibilityLabel="התנתקות מהמכשיר"
            accessibilityHint="יציאה מהחשבון במכשיר זה בלבד"
            style={({ pressed }) => [
              styles.option,
              pressed ? styles.optionPressed : null,
            ]}
          >
            <View style={styles.optionRow}>
              <View style={styles.iconShell}>
                <Ionicons
                  name="log-out-outline"
                  size={18}
                  color={SETTINGS_TOKENS.textPrimary}
                />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>התנתקות מהמכשיר</Text>
                <Text style={styles.optionSubtitle}>
                  יציאה מהחשבון במכשיר זה בלי לשנות את העסק או המנוי
                </Text>
              </View>
            </View>
          </Pressable>

          {showCancelSubscription && onCancelSubscription ? (
            <Pressable
              onPress={onCancelSubscription}
              accessibilityRole="button"
              accessibilityLabel="ביטול המנוי"
              accessibilityHint="מעבר לניהול המנוי והחיוב"
              style={({ pressed }) => [
                styles.option,
                pressed ? styles.optionPressed : null,
              ]}
            >
              <View style={styles.optionRow}>
                <View style={styles.iconShell}>
                  <Ionicons
                    name="card-outline"
                    size={18}
                    color={SETTINGS_TOKENS.textPrimary}
                  />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>ביטול המנוי</Text>
                  <Text style={styles.optionSubtitle}>
                    מעבר לניהול המסלול והחיוב הקיים
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="ביטול"
            style={({ pressed }) => [
              styles.cancel,
              pressed ? styles.optionPressed : null,
            ]}
          >
            <Text style={styles.cancelLabel}>ביטול</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.36)',
  },
  sheet: {
    marginTop: 'auto',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: SETTINGS_TOKENS.borderStrong,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 13,
    lineHeight: 18,
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  option: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionPressed: {
    opacity: 0.88,
  },
  optionRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  optionCopy: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 2,
  },
  optionTitle: {
    width: '100%',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  optionSubtitle: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cancel: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  cancelLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
