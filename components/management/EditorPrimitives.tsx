import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/ui/ActionButton';
import { rtlBaseView } from '@/lib/rtl';

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
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
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
  lifecycleVariant = 'lifecycle',
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
  lifecycleVariant?: 'secondary' | 'lifecycle';
  onLifecyclePress?: () => void;
}) {
  return (
    <View style={styles.actions}>
      <ActionButton
        label={primaryLabel}
        disabled={primaryDisabled}
        loading={primaryLoading}
        onPress={onPrimaryPress}
        fullWidth={true}
      />

      {secondaryLabel && onSecondaryPress ? (
        <ActionButton
          label={secondaryLabel}
          variant="secondary"
          disabled={secondaryDisabled}
          loading={secondaryLoading}
          onPress={onSecondaryPress}
          fullWidth={true}
        />
      ) : null}

      {lifecycleLabel && onLifecyclePress ? (
        <ActionButton
          label={lifecycleLabel}
          variant={lifecycleVariant}
          disabled={lifecycleDisabled}
          loading={lifecycleLoading}
          onPress={onLifecyclePress}
          fullWidth={true}
        />
      ) : null}
    </View>
  );
}

export function EditorStickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="editor-sticky-footer"
      style={[
        styles.stickyFooter,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <View style={styles.stickyFooterContent}>{children}</View>
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
  stickyFooter: {
    width: '100%',
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: '#D7E2F4',
    backgroundColor: '#E9F0FF',
    paddingHorizontal: 20,
    paddingTop: 12,
    overflow: 'visible',
    zIndex: 20,
    elevation: 20,
  },
  stickyFooterContent: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
});
