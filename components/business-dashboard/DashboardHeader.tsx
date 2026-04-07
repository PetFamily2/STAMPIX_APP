import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { tw } from '@/lib/rtl';

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  );

  if (hour < 12) {
    return 'בוקר טוב';
  }
  if (hour < 17) {
    return 'צהריים טובים';
  }
  return 'ערב טוב';
}

export function DashboardHeader({
  displayName,
  avatarUrl,
  onPressMenu,
}: {
  displayName: string;
  avatarUrl?: string | null;
  onPressMenu: () => void;
}) {
  const greeting = getGreeting();

  return (
    <View style={styles.wrap}>
      <View style={styles.leadingCluster}>
        <Pressable onPress={onPressMenu} style={styles.menuButton}>
          <Ionicons name="ellipsis-vertical" size={24} color="#111827" />
        </Pressable>

        <Text className={tw.textStart} style={styles.brandLine}>
          StampAix
        </Text>
      </View>

      <View style={styles.identityBlock}>
        <UserAvatar avatarUrl={avatarUrl} fullName={displayName} size={50} />

        <View style={styles.copyWrap}>
          <Text
            className={tw.textStart}
            numberOfLines={1}
            style={styles.greetingLine}
          >
            {`${greeting},`}
          </Text>

          <Text
            className={tw.textStart}
            numberOfLines={1}
            style={styles.businessName}
          >
            {displayName}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leadingCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  identityBlock: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  copyWrap: {
    flex: 1,
    gap: 1,
    alignItems: 'stretch',
  },
  greetingLine: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    color: '#2C3558',
  },
  businessName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: '#0F172A',
  },
  brandLine: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#2F6BFF',
  },
});
