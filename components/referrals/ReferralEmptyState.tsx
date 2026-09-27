import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';

type ReferralEmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function ReferralEmptyState({
  icon,
  title,
  body,
  actionLabel,
  onActionPress,
}: ReferralEmptyStateProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconCanvas}>
        <Ionicons name={icon} size={21} color="#1D4ED8" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {actionLabel && onActionPress ? (
        <ActionButton
          label={actionLabel}
          variant="secondary"
          onPress={onActionPress}
          accessibilityLabel={actionLabel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 8,
  },
  iconCanvas: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
  },
  copy: {
    gap: 2,
    alignItems: 'stretch',
  },
  title: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
