import { usePathname, useRouter } from 'expo-router';
import {
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  LifeBuoy,
  Trash2,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

const ITEMS = [
  { href: '/admin', label: 'מרכז תפעול', icon: LayoutDashboard },
  { href: '/admin/billing', label: 'חיוב', icon: CircleDollarSign },
  { href: '/admin/support', label: 'תמיכה', icon: LifeBuoy },
  { href: '/admin/deletions', label: 'מחיקות', icon: Trash2 },
] as const;

export function AdminWebShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 900;

  return (
    <View style={[styles.page, compact ? styles.pageCompact : null]}>
      <View style={[styles.sidebar, compact ? styles.sidebarCompact : null]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <View>
            <Text style={styles.brandName}>StampAix</Text>
            <Text style={styles.brandProduct}>Admin</Text>
          </View>
        </View>

        <View style={[styles.nav, compact ? styles.navCompact : null]}>
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/admin'
                ? pathname === '/admin'
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Pressable
                accessibilityRole="link"
                key={href}
                onPress={() => router.push(href)}
                style={({ pressed }) => [
                  styles.navItem,
                  active ? styles.navItemActive : null,
                  pressed ? styles.navItemPressed : null,
                ]}
              >
                <Icon
                  color={active ? TOKENS.colors.primary : TOKENS.colors.textMuted}
                  size={19}
                />
                <Text
                  style={[
                    styles.navText,
                    active ? styles.navTextActive : null,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.sidebarFooter, compact ? styles.sidebarFooterCompact : null]}>
          <Building2 color={TOKENS.colors.textMuted} size={17} />
          <Text style={styles.sidebarFooterText}>כלים תפעוליים לקריאה בלבד</Text>
        </View>
      </View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: TOKENS.colors.pageBackground,
    flex: 1,
    flexDirection: flexDirection.row,
    minHeight: '100vh' as never,
  },
  pageCompact: {
    flexDirection: 'column',
  },
  sidebar: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderLeftColor: TOKENS.colors.border,
    borderLeftWidth: 1,
    minHeight: '100vh' as never,
    padding: TOKENS.space.xl,
    width: 240,
  },
  sidebarCompact: {
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    minHeight: 0,
    padding: TOKENS.space.lg,
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  brandName: {
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  brandProduct: {
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  nav: { gap: 6, marginTop: TOKENS.space.xxl },
  navCompact: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    marginTop: TOKENS.space.lg,
  },
  navItem: {
    alignItems: 'center',
    borderRadius: TOKENS.radii.md,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    minHeight: 46,
    paddingHorizontal: TOKENS.space.md,
  },
  navItemActive: { backgroundColor: TOKENS.colors.primarySubtle },
  navItemPressed: { opacity: 0.72 },
  navText: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  navTextActive: { color: TOKENS.colors.primary },
  sidebarFooter: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    marginTop: 'auto' as never,
    paddingTop: TOKENS.space.xl,
  },
  sidebarFooterCompact: {
    display: 'none',
  },
  sidebarFooterText: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    flex: 1,
    fontSize: 11,
  },
  content: { flex: 1, minWidth: 0 },
});
