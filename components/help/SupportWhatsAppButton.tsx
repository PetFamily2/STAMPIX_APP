import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsGroup, SettingsNavRow } from '@/components/business-settings';
import {
  alertWhatsAppUnavailable,
  openSupportWhatsApp,
  SUPPORT_CONTACT_COPY,
  type SupportWhatsAppContext,
} from '@/lib/help/supportContact';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

export function SupportWhatsAppButton({
  variant = 'settings',
  context = variant === 'settings' ? 'business' : 'customer',
}: {
  variant?: 'customer' | 'settings';
  context?: SupportWhatsAppContext;
}) {
  const handlePress = () => {
    void openSupportWhatsApp(context).then((result) => {
      if (result === 'unavailable') {
        alertWhatsAppUnavailable();
      }
    });
  };

  if (variant === 'settings') {
    return (
      <SettingsGroup>
        <SettingsNavRow
          title={SUPPORT_CONTACT_COPY.whatsappTitle}
          subtitle={SUPPORT_CONTACT_COPY.whatsappSubtitle}
          icon="logo-whatsapp"
          onPress={handlePress}
          isLast={true}
          accessibilityHint={SUPPORT_CONTACT_COPY.whatsappAccessibility}
        />
      </SettingsGroup>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SUPPORT_CONTACT_COPY.whatsappAccessibility}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.customerRow,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.customerIcon}>
        <Ionicons name="logo-whatsapp" size={20} color="#128C7E" />
      </View>
      <View style={styles.customerCopy}>
        <Text style={styles.customerTitle} maxFontSizeMultiplier={1.4}>
          {SUPPORT_CONTACT_COPY.whatsappTitle}
        </Text>
        <Text style={styles.customerSubtitle} maxFontSizeMultiplier={1.4}>
          {SUPPORT_CONTACT_COPY.whatsappSubtitle}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color="#94A3B8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  customerRow: {
    width: '100%',
    minHeight: 52,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...rtlBaseView,
  },
  customerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    flexShrink: 0,
  },
  customerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 2,
  },
  customerTitle: {
    width: '100%',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  customerSubtitle: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.88,
  },
});
