import type { Href } from 'expo-router';
import { usePathname, useRouter } from 'expo-router';
import { Ellipsis, QrCode, Users } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection } from '@/lib/rtl';

export function StaffWebFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scanner = pathname.includes('scanner');
  const customers = pathname.includes('customers');
  const more = !scanner && !customers && pathname !== '/staff';

  return (
    <View style={styles.screen}>
      <View style={styles.body}>{children}</View>
      <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <Tab
          active={scanner}
          icon={QrCode}
          label="סריקה"
          onPress={() => router.push('/staff/scanner-preview' as Href)}
        />
        <Tab
          active={customers}
          icon={Users}
          label="לקוחות"
          onPress={() => router.push('/staff/customers' as Href)}
        />
        <Tab
          active={more}
          icon={Ellipsis}
          label="עוד"
          onPress={() => router.push('/staff/settings' as Href)}
        />
      </View>
    </View>
  );
}

function Tab({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: typeof QrCode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.tab}
    >
      <Icon
        color={active ? TOKENS.colors.primary : TOKENS.colors.textMuted}
        size={22}
        strokeWidth={1.75}
      />
      <Text style={[styles.label, active ? styles.labelOn : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TOKENS.colors.pageBackground },
  body: { flex: 1 },
  bar: {
    minHeight: 68,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: { color: TOKENS.colors.textMuted, fontSize: 11, fontWeight: '500' },
  labelOn: { color: TOKENS.colors.primary, fontWeight: '600' },
});
