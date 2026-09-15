import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { flexDirection, rtlBaseView } from '@/lib/rtl';

export type CampaignManagementType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo'
  | 'referral';

const TYPE_META: Record<
  CampaignManagementType,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBackground: string;
  }
> = {
  welcome: {
    label: 'ברוכים הבאים',
    icon: 'hand-left-outline',
    iconColor: '#1D4ED8',
    iconBackground: '#DBEAFE',
  },
  birthday: {
    label: 'יום הולדת',
    icon: 'gift-outline',
    iconColor: '#C2410C',
    iconBackground: '#FFEDD5',
  },
  anniversary: {
    label: 'יום נישואין',
    icon: 'heart-outline',
    iconColor: '#9D174D',
    iconBackground: '#FCE7F3',
  },
  winback: {
    label: 'השבת לקוחות',
    icon: 'refresh-outline',
    iconColor: '#0F766E',
    iconBackground: '#CCFBF1',
  },
  promo: {
    label: 'קמפיין כללי',
    icon: 'megaphone-outline',
    iconColor: '#4C1D95',
    iconBackground: '#EDE9FE',
  },
  referral: {
    label: 'חבר מביא חבר',
    icon: 'people-outline',
    iconColor: '#1D4ED8',
    iconBackground: '#DBEAFE',
  },
};

export function CampaignManagementCard({
  type,
  title,
  lifecycle,
  timingLabel,
  audienceCount,
  onPress,
}: {
  type: CampaignManagementType;
  title: string;
  lifecycle: 'active' | 'inactive' | 'archived';
  timingLabel: string;
  audienceCount?: number | null;
  onPress: () => void;
}) {
  const meta = TYPE_META[type];
  const statusLabel =
    lifecycle === 'active'
      ? 'פעיל'
      : lifecycle === 'archived'
        ? 'בארכיון'
        : 'לא פעיל';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`פתיחת הקמפיין ${title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        lifecycle === 'archived' ? styles.cardArchived : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View
        style={[styles.iconCanvas, { backgroundColor: meta.iconBackground }]}
      >
        <Ionicons name={meta.icon} size={20} color={meta.iconColor} />
      </View>

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.title}>
            {title}
          </Text>
          <View
            style={[
              styles.status,
              lifecycle === 'active'
                ? styles.statusActive
                : lifecycle === 'archived'
                  ? styles.statusArchived
                  : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                lifecycle === 'active'
                  ? styles.statusTextActive
                  : lifecycle === 'archived'
                    ? styles.statusTextArchived
                    : styles.statusTextInactive,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.summary}>
          {meta.label} · {timingLabel}
        </Text>
        {typeof audienceCount === 'number' && audienceCount > 0 ? (
          <Text style={styles.metric}>
            קהל מוערך: {audienceCount.toLocaleString('he-IL')}
          </Text>
        ) : null}
      </View>

      <View style={styles.chevronCanvas}>
        <Ionicons name="chevron-back" size={18} color="#64748B" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minHeight: 88,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
    ...rtlBaseView,
  },
  cardArchived: {
    minHeight: 72,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    paddingVertical: 8,
  },
  iconCanvas: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 3,
  },
  titleRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: '#12203A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summary: {
    width: '100%',
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metric: {
    width: '100%',
    color: '#475569',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  status: {
    minHeight: 24,
    flexShrink: 0,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statusActive: { backgroundColor: '#DCFCE7' },
  statusInactive: { backgroundColor: '#E2E8F0' },
  statusArchived: { backgroundColor: '#E5E7EB' },
  statusText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  statusTextActive: { color: '#166534' },
  statusTextInactive: { color: '#334155' },
  statusTextArchived: { color: '#475569' },
  chevronCanvas: {
    width: 28,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.84,
  },
});
