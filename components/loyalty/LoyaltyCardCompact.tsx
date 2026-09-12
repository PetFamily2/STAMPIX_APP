import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveCardTheme } from '@/constants/cardThemes';
import type { LoyaltyProgramLifecycle } from '@/lib/loyalty/cardPresentation';
import { flexDirection, rtlAutoText } from '@/lib/rtl';
import { LoyaltyStatusBadge } from './LoyaltyStatusBadge';
import { StampIcon } from './StampIcon';

export function LoyaltyCardCompact({
  title,
  rewardName,
  cardThemeId,
  stampIcon,
  lifecycle,
  memberCount,
  onPress,
}: {
  title: string;
  rewardName: string;
  cardThemeId?: string | null;
  stampIcon?: string;
  lifecycle: LoyaltyProgramLifecycle;
  memberCount?: number;
  onPress: () => void;
}) {
  const theme = resolveCardTheme(cardThemeId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. הטבה: ${rewardName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed ? styles.pressed : null]}
    >
      <LinearGradient
        colors={[theme.surface, theme.surfaceAlt]}
        style={styles.identity}
      >
        <StampIcon value={stampIcon} size={30} color={theme.accent} />
      </LinearGradient>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <LoyaltyStatusBadge lifecycle={lifecycle} />
        </View>
        <Text numberOfLines={1} style={styles.reward}>
          {rewardName}
        </Text>
        {typeof memberCount === 'number' ? (
          <Text style={styles.metric}>
            {memberCount.toLocaleString('he-IL')} לקוחות
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-back" size={20} color="#64748B" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: 600,
    minHeight: 94,
    alignSelf: 'center',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 10,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
  identity: {
    width: 66,
    height: 72,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...rtlAutoText,
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  reward: {
    ...rtlAutoText,
    width: '100%',
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  metric: {
    ...rtlAutoText,
    width: '100%',
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
});
