import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
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
  layoutMode,
  displayName,
  businessName,
  avatarUrl,
  onPressMenu,
  onPressNotifications,
  notificationCount = 0,
}: {
  layoutMode: DashboardLayoutMode;
  displayName: string;
  businessName?: string;
  avatarUrl?: string | null;
  onPressMenu: () => void;
  onPressNotifications?: () => void;
  notificationCount?: number;
}) {
  const layout = getDashboardLayout(layoutMode);
  const greeting = getGreeting();
  const greetingWithName = `${greeting}, ${displayName}`;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onPressNotifications}
          style={styles.notificationButton}
          accessibilityRole="button"
          accessibilityLabel="התראות עסק"
        >
          <Ionicons name="notifications-outline" size={24} color="#0F172A" />
          {notificationCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {notificationCount > 9 ? '9+' : notificationCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Text
          className={tw.textStart}
          style={[
            styles.brandLine,
            {
              fontSize: layout.headerBrandSize,
              lineHeight: layout.headerBrandSize + 6,
            },
          ]}
        >
          StampAix
        </Text>

        <View style={styles.rightActions}>
          <Ionicons name="chevron-down" size={15} color="#64748B" />
          <Pressable
            onPress={onPressMenu}
            accessibilityRole="button"
            accessibilityLabel="תפריט עסק"
          >
            <UserAvatar
              avatarUrl={avatarUrl}
              fullName={displayName}
              size={40}
            />
          </Pressable>
          <Pressable
            onPress={onPressMenu}
            style={styles.menuButton}
            accessibilityRole="button"
            accessibilityLabel="פתיחת תפריט"
          >
            <Ionicons name="menu-outline" size={30} color="#1E3A8A" />
          </Pressable>
        </View>
      </View>

      <View style={styles.greetingRow}>
        <Text
          className={tw.textStart}
          numberOfLines={1}
          style={[
            styles.greetingLine,
            {
              fontSize: layout.headerGreetingSize,
              lineHeight: layout.headerGreetingSize + 5,
            },
          ]}
        >
          {greetingWithName}
        </Text>
        <View style={styles.businessRow}>
          <Ionicons name="chevron-down" size={16} color="#334155" />
          {businessName ? (
            <Text
              className={tw.textStart}
              numberOfLines={1}
              style={[
                styles.businessName,
                {
                  fontSize: layout.headerBusinessSize,
                  lineHeight: layout.headerBusinessSize + 4,
                },
              ]}
            >
              {businessName}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rightActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
  },
  menuButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  brandLine: {
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.brandBlue,
    letterSpacing: 0,
  },
  greetingRow: {
    alignItems: 'flex-end',
    gap: 2,
  },
  greetingLine: {
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  businessRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  businessName: {
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
});
