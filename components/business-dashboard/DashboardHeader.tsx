import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { alignItems, flexDirection, rtlBaseText, rtlBaseView } from '@/lib/rtl';

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
}: {
  layoutMode: DashboardLayoutMode;
  displayName: string;
  businessName?: string;
  avatarUrl?: string | null;
  onPressMenu: () => void;
}) {
  const layout = getDashboardLayout(layoutMode);
  const greeting = getGreeting();
  const greetingWithName = `${greeting}, ${displayName}`;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.greetingBlock}>
          <Text
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
            {businessName ? (
              <Text
                numberOfLines={2}
                ellipsizeMode="tail"
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

        <Pressable
          onPress={onPressMenu}
          style={styles.identityButton}
          accessibilityRole="button"
          accessibilityLabel="פתיחת הגדרות העסק"
        >
          <UserAvatar avatarUrl={avatarUrl} fullName={displayName} size={40} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 0,
    ...rtlBaseView,
  },
  topRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  identityButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 1,
    ...rtlBaseView,
  },
  greetingLine: {
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    alignSelf: 'stretch',
    ...rtlBaseText,
  },
  businessRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 2,
    alignSelf: 'stretch',
    maxWidth: '100%',
    minWidth: 0,
    ...rtlBaseView,
  },
  businessName: {
    flex: 1,
    minWidth: 0,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    ...rtlBaseText,
  },
});
