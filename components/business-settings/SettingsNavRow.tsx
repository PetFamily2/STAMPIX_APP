import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  SETTINGS_SHADOW,
  SETTINGS_TOKENS,
} from '@/components/business-settings/tokens';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

type SettingsNavRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  showChevron?: boolean;
  accessibilityHint?: string;
  accessibilityState?: {
    selected?: boolean;
    disabled?: boolean;
    expanded?: boolean;
  };
  trailing?: ReactNode;
  isLast?: boolean;
};

export function SettingsNavRow({
  title,
  subtitle,
  value,
  icon,
  onPress,
  disabled = false,
  destructive = false,
  showChevron = true,
  accessibilityHint,
  accessibilityState,
  trailing,
  isLast = false,
}: SettingsNavRowProps) {
  const displayValue = value?.trim() ? value : undefined;
  const accessibilityLabel = displayValue ? `${title}, ${displayValue}` : title;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint ?? `פתיחת ${title}`}
      accessibilityState={{
        disabled,
        ...accessibilityState,
      }}
      style={({ pressed }) => [
        styles.row,
        isLast ? styles.rowLast : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.inner}>
        {icon ? (
          <View
            style={[
              styles.iconShell,
              destructive ? styles.iconShellDestructive : null,
            ]}
          >
            <Ionicons
              name={icon}
              size={18}
              color={
                destructive
                  ? SETTINGS_TOKENS.destructive
                  : SETTINGS_TOKENS.accentText
              }
            />
          </View>
        ) : null}

        <View style={styles.copy}>
          <Text
            style={[styles.title, destructive ? styles.titleDestructive : null]}
            maxFontSizeMultiplier={1.4}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
              {subtitle}
            </Text>
          ) : null}
          {displayValue ? (
            <Text
              style={[
                styles.value,
                displayValue === 'לא הוגדר' ? styles.valueEmpty : null,
              ]}
              maxFontSizeMultiplier={1.4}
            >
              {displayValue}
            </Text>
          ) : null}
        </View>

        {trailing ??
          (showChevron ? (
            <View style={styles.chevronWrap}>
              <Ionicons
                name="chevron-back"
                size={18}
                color={SETTINGS_TOKENS.textTertiary}
              />
            </View>
          ) : null)}
      </View>
    </Pressable>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: SETTINGS_TOKENS.surface,
    borderRadius: SETTINGS_TOKENS.radiusLg,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    overflow: 'hidden',
    ...SETTINGS_SHADOW,
  },
  row: {
    minHeight: SETTINGS_TOKENS.rowMinHeight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SETTINGS_TOKENS.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  inner: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...rtlBaseView,
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SETTINGS_TOKENS.accentSoft,
  },
  iconShellDestructive: {
    backgroundColor: SETTINGS_TOKENS.destructiveSoft,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 3,
  },
  title: {
    width: '100%',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  titleDestructive: {
    color: SETTINGS_TOKENS.destructive,
  },
  subtitle: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  value: {
    width: '100%',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  valueEmpty: {
    color: SETTINGS_TOKENS.textTertiary,
    fontWeight: '400',
  },
  chevronWrap: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.86,
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
  },
  disabled: {
    opacity: 0.58,
  },
});
