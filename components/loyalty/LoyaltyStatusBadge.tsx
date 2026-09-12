import { StyleSheet, Text, View } from 'react-native';
import type { LoyaltyProgramLifecycle } from '@/lib/loyalty/cardPresentation';

const STATUS = {
  active: { label: 'פעילה', background: '#DCFCE7', foreground: '#166534' },
  draft: { label: 'טיוטה', background: '#FEF3C7', foreground: '#92400E' },
  archived: { label: 'בארכיון', background: '#E2E8F0', foreground: '#475569' },
} as const;

export function LoyaltyStatusBadge({
  lifecycle,
}: {
  lifecycle: LoyaltyProgramLifecycle;
}) {
  const status = STATUS[lifecycle];
  return (
    <View
      accessibilityLabel={`סטטוס: ${status.label}`}
      style={[styles.badge, { backgroundColor: status.background }]}
    >
      <Text style={[styles.text, { color: status.foreground }]}>
        {status.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
});
