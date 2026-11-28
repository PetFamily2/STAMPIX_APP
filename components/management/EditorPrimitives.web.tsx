import type { ReactNode } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '@/components/ui/ActionButton';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import { webInputTypography } from '@/lib/design/webProductChrome';
import { rtlBaseView } from '@/lib/rtl';

export function EditorSection({
  title,
  subtitle,
  children,
  style,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, compact && styles.sectionCompact, style]}>
      <View style={styles.sectionHeading}>
        <Text
          accessibilityRole={compact ? 'header' : undefined}
          aria-level={compact ? 2 : undefined}
          style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.sectionSubtitle,
              compact && styles.sectionSubtitleCompact,
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function EditorPreviewSurface({
  title = 'כך הלקוחות יראו את זה',
  children,
  style,
  compact = false,
}: {
  title?: string;
  children: ReactNode;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.preview, compact && styles.previewCompact, style]}>
      <Text
        style={[styles.previewLabel, compact && styles.previewLabelCompact]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function EditorPrimaryActions({
  compact = false,
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
  compact?: boolean;
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
    <View style={[styles.actions, compact && styles.actionsCompact]}>
      <ActionButton
        label={primaryLabel}
        labelStyle={compact ? styles.compactActionLabel : undefined}
        disabled={primaryDisabled}
        loading={primaryLoading}
        onPress={onPrimaryPress}
        fullWidth={true}
      />

      {secondaryLabel && onSecondaryPress ? (
        <ActionButton
          style={compact ? styles.secondaryAction : undefined}
          labelStyle={compact ? styles.compactActionLabel : undefined}
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
          style={compact ? styles.secondaryAction : undefined}
          labelStyle={compact ? styles.compactActionLabel : undefined}
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

export function EditorStickyFooter({
  children,
  contentStyle,
  dense = false,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  dense?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="editor-sticky-footer"
      style={[
        styles.stickyFooter,
        dense ? styles.stickyFooterDense : null,
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <View style={[styles.stickyFooterContent, contentStyle]}>{children}</View>
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
  sectionCompact: {
    gap: T.space.sm,
    borderColor: T.colors.border,
    borderRadius: T.radii.lg,
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.md,
  },
  sectionTitleCompact: {
    ...webInputTypography,
    ...T.typography.sectionTitle,
    color: T.colors.textPrimary,
  },
  sectionSubtitleCompact: {
    ...webInputTypography,
    ...T.typography.secondaryBody,
    color: T.colors.textSecondary,
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
  previewCompact: {
    gap: T.space.xs,
    borderTopWidth: 1,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: T.colors.border,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: T.space.sm,
    paddingBottom: 0,
  },
  previewLabelCompact: {
    ...webInputTypography,
    ...T.typography.label,
    color: T.colors.textSecondary,
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
  actionsCompact: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: T.space.xs,
  },
  secondaryAction: {
    width: 'auto',
    flexBasis: '45%',
    flexGrow: 1,
    minWidth: 0,
  },
  compactActionLabel: { ...webInputTypography, fontWeight: '600' },
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
  stickyFooterDense: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  stickyFooterContent: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
});
