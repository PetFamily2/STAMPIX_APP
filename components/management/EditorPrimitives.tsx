import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { flexDirection, rtlBaseView } from '@/lib/rtl';

export function EditorSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function EditorPreviewSurface({
  title = 'כך הלקוחות יראו את זה',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.preview}>
      <Text style={styles.previewLabel}>{title}</Text>
      {children}
    </View>
  );
}

export function EditorPrimaryActions({
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  onPrimaryPress,
  secondaryLabel,
  secondaryDisabled,
  secondaryLoading,
  onSecondaryPress,
  lifecycleLabel,
  lifecycleDisabled,
  lifecycleLoading,
  onLifecyclePress,
}: {
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  secondaryDisabled?: boolean;
  secondaryLoading?: boolean;
  onSecondaryPress?: () => void;
  lifecycleLabel?: string;
  lifecycleDisabled?: boolean;
  lifecycleLoading?: boolean;
  onLifecyclePress?: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryDisabled, busy: primaryLoading }}
        disabled={primaryDisabled}
        onPress={onPrimaryPress}
        style={({ pressed }) => [
          styles.primaryButton,
          primaryDisabled ? styles.primaryButtonDisabled : null,
          pressed && !primaryDisabled ? styles.pressed : null,
        ]}
      >
        {primaryLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
        )}
      </Pressable>

      {secondaryLabel && onSecondaryPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: secondaryDisabled,
            busy: secondaryLoading,
          }}
          disabled={secondaryDisabled}
          onPress={onSecondaryPress}
          style={({ pressed }) => [
            styles.secondaryButton,
            secondaryDisabled ? styles.secondaryButtonDisabled : null,
            pressed && !secondaryDisabled ? styles.pressed : null,
          ]}
        >
          {secondaryLoading ? (
            <ActivityIndicator color="#1D4ED8" />
          ) : (
            <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
          )}
        </Pressable>
      ) : null}

      {lifecycleLabel && onLifecyclePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: lifecycleDisabled,
            busy: lifecycleLoading,
          }}
          disabled={lifecycleDisabled}
          onPress={onLifecyclePress}
          style={({ pressed }) => [
            styles.lifecycleButton,
            lifecycleDisabled ? styles.lifecycleButtonDisabled : null,
            pressed && !lifecycleDisabled ? styles.pressed : null,
          ]}
        >
          {lifecycleLoading ? (
            <ActivityIndicator color="#64748B" />
          ) : (
            <Text style={styles.lifecycleButtonText}>{lifecycleLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    gap: 16,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionHeading: {
    width: '100%',
    gap: 3,
    alignItems: 'stretch',
  },
  sectionTitle: {
    width: '100%',
    color: '#12203A',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionSubtitle: {
    width: '100%',
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  preview: {
    width: '100%',
    gap: 10,
    borderWidth: 1,
    borderColor: '#C9D9F6',
    borderRadius: 22,
    backgroundColor: '#F5F8FF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  previewLabel: {
    width: '100%',
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actions: {
    width: '100%',
    gap: 10,
    ...rtlBaseView,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#B8C8E8',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  lifecycleButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#D7DEEA',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  lifecycleButtonDisabled: {
    opacity: 0.55,
  },
  lifecycleButtonText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.84,
  },
});
