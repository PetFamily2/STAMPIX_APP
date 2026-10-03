import {
  X } from 'lucide-react-native';
import { type ReactNode,
  useEffect,
  useId,
  useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';

import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { alignItems, flexDirection, justifyContent } from '@/lib/rtl';

type BusinessWebDialogProps = {
  children: ReactNode;
  description?: string;
  dismissDisabled?: boolean;
  maxWidth?: number;
  onDismiss: () => void;
  title: string;
  visible: boolean;
};

export function BusinessWebDialog({
  children,
  description,
  dismissDisabled = false,
  maxWidth = 520,
  onDismiss,
  title,
  visible,
}: BusinessWebDialogProps) {
  const dialogId = `business-web-dialog-${useId().replace(/:/g, '')}`;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const dialog = document.getElementById(dialogId);
      const firstFocusable = dialog?.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !dismissDisabled) {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const dialog = document.getElementById(dialogId);
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [dialogId, dismissDisabled, onDismiss, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityViewIsModal={true}
      nativeID={dialogId}
      style={styles.overlay}
    >
      <Pressable
        accessibilityLabel="סגירת החלון"
        accessibilityRole="button"
        disabled={dismissDisabled}
        onPress={onDismiss}
        style={styles.backdrop}
      />
      <View
        accessibilityLabel={title}
        role="dialog"
        style={[styles.dialog, { maxWidth }]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            {description ? (
              <Text style={styles.description}>{description}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="סגירה"
            accessibilityRole="button"
            accessibilityState={{ disabled: dismissDisabled }}
            disabled={dismissDisabled}
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.closeButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <X color={TOKENS.colors.textSecondary} size={20} />
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

type BusinessWebConfirmDialogProps = {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: 'danger' | 'primary';
  visible: boolean;
};

export function BusinessWebConfirmDialog({
  busy = false,
  cancelLabel = 'ביטול',
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
  tone = 'danger',
  visible,
}: BusinessWebConfirmDialogProps) {
  return (
    <BusinessWebDialog
      description={description}
      dismissDisabled={busy}
      maxWidth={460}
      onDismiss={onCancel}
      title={title}
      visible={visible}
    >
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={cancelLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={confirmLabel}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.confirmButton,
            tone === 'danger'
              ? styles.confirmButtonDanger
              : styles.confirmButtonPrimary,
            pressed ? styles.pressed : null,
          ]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
          <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </BusinessWebDialog>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: TOKENS.space.lg,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dialog: {
    ...TOKENS.shadow,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    maxHeight: '92%',
    padding: TOKENS.space.xl,
    width: '100%',
  },
  header: {
    alignItems: alignItems.start,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    justifyContent: 'space-between',
    marginBottom: TOKENS.space.xl,
  },
  headerCopy: { flex: 1, gap: TOKENS.space.xs },
  title: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  description: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.sm,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actions: {
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    justifyContent: justifyContent.start,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: TOKENS.space.lg,
  },
  secondaryButtonText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
  },
  confirmButton: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: TOKENS.space.lg,
  },
  confirmButtonDanger: { backgroundColor: TOKENS.colors.danger },
  confirmButtonPrimary: { backgroundColor: TOKENS.colors.primary },
  confirmButtonText: { ...TOKENS.typography.label, color: '#FFFFFF' },
  pressed: { opacity: 0.82 },
});
