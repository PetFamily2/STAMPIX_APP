import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  SETTINGS_SHADOW,
  SETTINGS_TOKENS,
} from '@/components/business-settings/tokens';

type SettingsCardTone = 'default' | 'muted' | 'warning' | 'danger';

export function SettingsCard({
  children,
  tone = 'default',
  padded = true,
}: {
  children: ReactNode;
  tone?: SettingsCardTone;
  padded?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        padded ? styles.cardPadded : null,
        tone === 'muted' ? styles.cardMuted : null,
        tone === 'warning' ? styles.cardWarning : null,
        tone === 'danger' ? styles.cardDanger : null,
      ]}
    >
      {children}
    </View>
  );
}

export function SettingsField({
  label,
  children,
  value,
  helpText,
  errorText,
  readOnly = false,
}: {
  label: string;
  children?: ReactNode;
  value?: ReactNode;
  helpText?: string;
  errorText?: string | null;
  readOnly?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      {children ?? (
        <View
          style={[styles.valueBox, readOnly ? styles.valueBoxReadOnly : null]}
        >
          {typeof value === 'string' || typeof value === 'number' ? (
            <Text style={styles.valueText} maxFontSizeMultiplier={1.4}>
              {String(value)}
            </Text>
          ) : (
            value
          )}
        </View>
      )}
      {errorText ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {errorText}
        </Text>
      ) : helpText ? (
        <Text style={styles.helpText}>{helpText}</Text>
      ) : null}
    </View>
  );
}

export function SettingsDangerSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.dangerSection}>
      <View style={styles.dangerCopy}>
        <Text style={styles.dangerTitle} maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {description ? (
          <Text style={styles.dangerDescription} maxFontSizeMultiplier={1.4}>
            {description}
          </Text>
        ) : null}
      </View>
      <SettingsCard tone="danger" padded={false}>
        {children}
      </SettingsCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: SETTINGS_TOKENS.radiusLg,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    overflow: 'hidden',
    ...SETTINGS_SHADOW,
  },
  cardPadded: {
    padding: 16,
    gap: 16,
  },
  cardMuted: {
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
  },
  cardWarning: {
    borderColor: SETTINGS_TOKENS.warningBorder,
    backgroundColor: SETTINGS_TOKENS.warningBg,
  },
  cardDanger: {
    borderColor: '#F2C5C5',
    backgroundColor: SETTINGS_TOKENS.surface,
  },
  field: {
    width: '100%',
    alignItems: 'stretch',
    gap: 7,
  },
  fieldLabel: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  valueBox: {
    width: '100%',
    minHeight: 52,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 16,
    paddingVertical: 13,
    justifyContent: 'center',
  },
  valueBoxReadOnly: {
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
  },
  valueText: {
    width: '100%',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helpText: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorText: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.destructive,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dangerSection: {
    width: '100%',
    gap: 10,
    alignItems: 'stretch',
  },
  dangerCopy: {
    width: '100%',
    paddingHorizontal: 5,
    gap: 2,
  },
  dangerTitle: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: SETTINGS_TOKENS.destructive,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  dangerDescription: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
