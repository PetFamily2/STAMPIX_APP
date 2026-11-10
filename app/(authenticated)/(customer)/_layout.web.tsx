import { Tabs, usePathname, useSegments } from 'expo-router';
import { MapPin, QrCode, Settings, Stamp } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

const ACCOUNT_ROUTES = new Set([
  'settings',
  'account-details',
  'help-support',
  'referrals',
]);

export default function CustomerWebTabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const pathname = usePathname();
  const leaf =
    pathname.split('/').filter(Boolean).at(-1) ??
    (Array.isArray(segments) ? String(segments.at(-1) ?? 'wallet') : 'wallet');
  const active = ACCOUNT_ROUTES.has(leaf) ? 'settings' : leaf;
  const barHeight = 68 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: TOKENS.colors.elevatedSurface,
          borderTopColor: TOKENS.colors.border,
          borderTopWidth: 1,
          height: barHeight,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="settings"
        options={{
          title: 'חשבון',
          tabBarButton: (props) => (
            <WebTab
              active={active === 'settings'}
              icon={Settings}
              label="חשבון"
              onPress={props.onPress}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          title: 'גילוי',
          tabBarButton: (props) => (
            <WebTab
              active={active === 'discovery'}
              icon={MapPin}
              label="גילוי"
              onPress={props.onPress}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="show-qr"
        options={{
          title: 'QR',
          tabBarButton: (props) => (
            <WebTab
              active={active === 'show-qr'}
              icon={QrCode}
              label="QR"
              onPress={props.onPress}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'ארנק',
          tabBarButton: (props) => (
            <WebTab
              active={active === 'wallet'}
              icon={Stamp}
              label="ארנק"
              onPress={props.onPress}
            />
          ),
        }}
      />
      <Tabs.Screen name="rewards" options={{ href: null }} />
      <Tabs.Screen name="account-details" options={{ href: null }} />
      <Tabs.Screen name="help-support" options={{ href: null }} />
      <Tabs.Screen name="business/[businessId]" options={{ href: null }} />
      <Tabs.Screen
        name="customer-card/[membershipId]"
        options={{ href: null }}
      />
      <Tabs.Screen name="referrals" options={{ href: null }} />
    </Tabs>
  );
}

function WebTab({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: typeof Stamp;
  label: string;
  onPress: ((event: never) => void) | null | undefined;
}) {
  return (
    <Pressable
      accessibilityLabel={label === 'QR' ? 'הצג QR' : label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => onPress?.(undefined as never)}
      style={({ pressed }) => [styles.tab, pressed ? styles.pressed : null]}
    >
      <View style={[styles.icon, active ? styles.iconOn : null]}>
        <Icon
          color={active ? TOKENS.colors.primary : TOKENS.colors.textMuted}
          size={22}
          strokeWidth={1.75}
        />
      </View>
      <Text style={[styles.label, active ? styles.labelOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: { opacity: 0.92 },
  icon: {
    minWidth: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: { backgroundColor: TOKENS.colors.primarySubtle },
  label: {
    color: TOKENS.colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelOn: { color: TOKENS.colors.primary, fontWeight: '600' },
});
