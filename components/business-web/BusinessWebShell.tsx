import type { Href } from 'expo-router';
import {
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  Gift,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  ReceiptText,
  Settings,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react-native';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/ui/AppText';

import type { Id } from '@/convex/_generated/dataModel';
import {
  BUSINESS_WEB_ROUTES,
  isBusinessWebRouteActive,
} from '@/lib/businessWebNavigation';
import {
  type BusinessWebShellOverlay,
  getBusinessWebResponsiveLayout,
  getNextBusinessWebShellOverlay,
} from '@/lib/design/businessWebResponsive';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  alignItems,
  flexDirection,
  ltrIslandText,
  rtlBaseText,
} from '@/lib/rtl';

type BusinessIdentity = {
  businessId: Id<'businesses'>;
  name: string;
  staffRole: 'owner' | 'manager' | 'staff';
};

type BusinessWebShellProps = {
  activeBusiness: BusinessIdentity | null;
  activeBusinessId: Id<'businesses'> | null;
  businesses: BusinessIdentity[];
  children: ReactNode;
  currentPathname: string;
  displayName: string;
  email: string;
  isSigningOut: boolean;
  isSwitchingBusiness: boolean;
  onLogout: () => void;
  onNavigate: (href: Href) => void;
  onSelectBusiness: (businessId: Id<'businesses'>) => void;
  selectError: string;
};

type NavigationItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: Href;
};

export const BUSINESS_WEB_NAV_ITEMS: NavigationItem[] = [
  {
    key: 'dashboard',
    label: 'דף הבית',
    icon: LayoutDashboard,
    href: BUSINESS_WEB_ROUTES.dashboard,
  },
  {
    key: 'customers',
    label: 'לקוחות',
    icon: Users,
    href: BUSINESS_WEB_ROUTES.customers,
  },
  {
    key: 'loyalty',
    label: 'מועדון והטבות',
    icon: Gift,
    href: BUSINESS_WEB_ROUTES.loyalty,
  },
  {
    key: 'team',
    label: 'צוות',
    icon: UserRoundCog,
    href: BUSINESS_WEB_ROUTES.team,
  },
  {
    key: 'analytics',
    label: 'ניתוחים',
    icon: ChartNoAxesCombined,
    href: BUSINESS_WEB_ROUTES.analytics,
  },
  {
    key: 'billing',
    label: 'חיוב וחשבוניות',
    icon: ReceiptText,
    href: BUSINESS_WEB_ROUTES.billing,
  },
  {
    key: 'campaigns',
    label: 'קמפיינים',
    icon: Gift,
    href: BUSINESS_WEB_ROUTES.campaigns,
  },
  {
    key: 'referrals',
    label: 'הזמנת חברים',
    icon: Users,
    href: BUSINESS_WEB_ROUTES.referrals,
  },
  {
    key: 'inbox',
    label: 'תיבת הודעות',
    icon: ReceiptText,
    href: BUSINESS_WEB_ROUTES.inbox,
  },
  ...(process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true'
    ? [
        {
          key: 'scanner',
          label:
            process.env.EXPO_PUBLIC_MANUAL_QA_ENABLED === 'true'
              ? 'סריקה — Preview'
              : 'סריקה',
          icon: Gift,
          href: BUSINESS_WEB_ROUTES.scanner,
        },
      ]
    : []),
  {
    key: 'settings',
    label: 'הגדרות העסק',
    icon: Settings,
    href: BUSINESS_WEB_ROUTES.settings,
  },
];

const ROLE_LABELS = {
  owner: 'בעלים',
  manager: 'מנהל',
  staff: 'צוות',
} as const;

function initialsForName(displayName: string) {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'S'
  );
}

function NavList({
  compact = false,
  currentPathname,
  onNavigate,
}: {
  compact?: boolean;
  currentPathname: string;
  onNavigate: (href: Href) => void;
}) {
  return (
    <View accessibilityLabel="ניווט עסקי" style={styles.navList}>
      {BUSINESS_WEB_NAV_ITEMS.filter((item) => item.href).map((item) => {
        const Icon = item.icon;
        const isDisabled = !item.href;
        const isActive = isBusinessWebRouteActive(
          currentPathname,
          item.href ? String(item.href) : null
        );
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="link"
            accessibilityState={{ disabled: isDisabled, selected: isActive }}
            disabled={isDisabled}
            key={item.key}
            onPress={() => item.href && onNavigate(item.href)}
            style={({ pressed }) => [
              styles.navItem,
              isActive ? styles.navItemActive : null,
              compact ? styles.navItemCompact : null,
              pressed ? styles.controlPressed : null,
            ]}
          >
            <Icon
              color={isActive ? TOKENS.colors.primary : TOKENS.colors.textMuted}
              size={TOKENS.icons.navigation}
              strokeWidth={TOKENS.icons.strokeWidth}
            />
            <Text
              style={[styles.navLabel, isActive ? styles.navLabelActive : null]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BusinessSwitcher({
  activeBusiness,
  activeBusinessId,
  businesses,
  compact,
  isSwitchingBusiness,
  isOpen,
  onOpenChange,
  onSelectBusiness,
  popoverWidth,
  selectError,
  showBrandMark,
  showClosedError,
}: Pick<
  BusinessWebShellProps,
  | 'activeBusiness'
  | 'activeBusinessId'
  | 'businesses'
  | 'isSwitchingBusiness'
  | 'onSelectBusiness'
  | 'selectError'
> & {
  compact: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  popoverWidth: number;
  showBrandMark: boolean;
  showClosedError: boolean;
}) {
  const hasMultipleBusinesses = businesses.length > 1;

  return (
    <View
      style={[styles.switcherWrap, compact ? styles.switcherWrapCompact : null]}
    >
      <Pressable
        accessibilityLabel={
          hasMultipleBusinesses ? 'בחירת עסק פעיל' : 'העסק הפעיל'
        }
        accessibilityRole={hasMultipleBusinesses ? 'button' : 'text'}
        accessibilityState={{
          disabled: !hasMultipleBusinesses || isSwitchingBusiness,
          expanded: hasMultipleBusinesses ? isOpen : undefined,
        }}
        disabled={!hasMultipleBusinesses || isSwitchingBusiness}
        onPress={() => onOpenChange(!isOpen)}
        style={({ pressed }) => [
          styles.switcherButton,
          compact ? styles.switcherButtonCompact : null,
          !hasMultipleBusinesses ? styles.switcherButtonStatic : null,
          pressed ? styles.controlPressed : null,
        ]}
      >
        <View
          style={[
            styles.switcherIcon,
            showBrandMark ? styles.switcherBrandMark : null,
          ]}
        >
          {showBrandMark ? (
            <Text style={styles.switcherBrandMarkText}>S</Text>
          ) : (
            <Building2
              color={TOKENS.colors.primary}
              size={TOKENS.icons.standard}
              strokeWidth={TOKENS.icons.strokeWidth}
            />
          )}
        </View>
        <View style={styles.switcherCopy}>
          <Text numberOfLines={1} style={styles.switcherName}>
            {activeBusiness?.name ?? 'אין עסק פעיל'}
          </Text>
          {!compact ? (
            <Text style={styles.switcherMeta}>
              {isSwitchingBusiness
                ? 'מחליפים עסק…'
                : activeBusiness
                  ? ROLE_LABELS[activeBusiness.staffRole]
                  : 'בחרו עסק'}
            </Text>
          ) : null}
        </View>
        {hasMultipleBusinesses ? (
          <ChevronDown
            color={TOKENS.colors.textMuted}
            size={TOKENS.icons.meta}
            strokeWidth={TOKENS.icons.strokeWidth}
          />
        ) : null}
      </Pressable>

      {isOpen && hasMultipleBusinesses ? (
        <View
          accessibilityRole="menu"
          style={[
            styles.switcherMenu,
            compact ? styles.switcherMenuCompact : null,
            compact ? { width: popoverWidth } : null,
          ]}
        >
          {businesses.map((business) => {
            const isActive = business.businessId === activeBusinessId;
            return (
              <Pressable
                accessibilityLabel={`מעבר אל ${business.name}`}
                accessibilityRole="menuitem"
                accessibilityState={{
                  disabled: isActive || isSwitchingBusiness,
                  selected: isActive,
                }}
                disabled={isActive || isSwitchingBusiness}
                key={String(business.businessId)}
                onPress={() => {
                  onOpenChange(false);
                  onSelectBusiness(business.businessId);
                }}
                style={({ pressed }) => [
                  styles.switcherOption,
                  isActive ? styles.switcherOptionActive : null,
                  pressed ? styles.controlPressed : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.switcherOptionName,
                    isActive ? styles.switcherOptionNameActive : null,
                  ]}
                >
                  {business.name}
                </Text>
                <Text style={styles.switcherOptionRole}>
                  {ROLE_LABELS[business.staffRole]}
                </Text>
              </Pressable>
            );
          })}
          {selectError ? (
            <Text style={styles.selectError}>{selectError}</Text>
          ) : null}
        </View>
      ) : null}
      {selectError && !isOpen && showClosedError ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.switcherError,
            compact ? styles.switcherMenuCompact : null,
            compact ? { width: popoverWidth } : null,
          ]}
        >
          <Text style={styles.selectError}>{selectError}</Text>
        </View>
      ) : null}
    </View>
  );
}

function AccountBlock({
  displayName,
  email,
  isSigningOut,
  onLogout,
  compact = false,
}: Pick<
  BusinessWebShellProps,
  'displayName' | 'email' | 'isSigningOut' | 'onLogout'
> & { compact?: boolean }) {
  return (
    <View
      style={[styles.accountBlock, compact ? styles.accountBlockCompact : null]}
    >
      <View accessibilityLabel={`חשבון ${displayName}`} style={styles.avatar}>
        <Text style={styles.avatarText}>{initialsForName(displayName)}</Text>
      </View>
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={styles.accountName}>
          {displayName || 'החשבון שלי'}
        </Text>
        {email ? (
          <Text numberOfLines={1} style={styles.accountEmail}>
            {email}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel="התנתקות"
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut }}
        disabled={isSigningOut}
        onPress={onLogout}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed ? styles.controlPressed : null,
        ]}
      >
        <LogOut
          color={TOKENS.colors.textSecondary}
          size={TOKENS.icons.standard}
          strokeWidth={TOKENS.icons.strokeWidth}
        />
      </Pressable>
    </View>
  );
}

export function BusinessWebShell(props: BusinessWebShellProps) {
  const { width } = useWindowDimensions();
  const responsiveLayout = getBusinessWebResponsiveLayout(width);
  const isCompact = responsiveLayout.navigation === 'compact';
  const isMobileComposition =
    responsiveLayout.composition === 'mobile' ||
    responsiveLayout.composition === 'narrow-mobile';
  const isNarrowSidebar = width < 1200;
  const popoverWidth = responsiveLayout.popoverWidth;
  const topbarHeight = isMobileComposition ? 50 : 48;
  const drawerWidth = Math.min(360, Math.max(0, width - 16));
  const [activeOverlay, setActiveOverlay] =
    useState<BusinessWebShellOverlay>(null);
  const isMobileMenuOpen = activeOverlay === 'navigation';
  const isBusinessMenuOpen = activeOverlay === 'business';
  const isAccountMenuOpen = activeOverlay === 'account';
  const initials = useMemo(
    () => initialsForName(props.displayName),
    [props.displayName]
  );

  useEffect(() => {
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveOverlay(null);
      }
    }

    document.addEventListener('keydown', dismissOnEscape);
    return () => document.removeEventListener('keydown', dismissOnEscape);
  }, []);

  useEffect(() => {
    if (!isCompact && activeOverlay === 'navigation') {
      setActiveOverlay(null);
    }
  }, [activeOverlay, isCompact]);

  function toggleOverlay(
    requestedOverlay: Exclude<BusinessWebShellOverlay, null>
  ) {
    setActiveOverlay((currentOverlay) =>
      getNextBusinessWebShellOverlay(currentOverlay, requestedOverlay)
    );
  }

  return (
    <SafeAreaView nativeID="business-web-shell" style={styles.safeArea}>
      <View style={[styles.shell, isCompact ? styles.shellCompact : null]}>
        {!isCompact ? (
          <View
            style={[
              styles.sidebar,
              isNarrowSidebar ? styles.sidebarNarrow : null,
            ]}
          >
            <View style={styles.brandArea}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>StampAix</Text>
                <Text style={styles.brandProduct}>Business</Text>
              </View>
            </View>
            <View style={styles.sidebarBusiness}>
              <Text style={styles.sidebarEyebrow}>העסק הפעיל</Text>
              <Text numberOfLines={1} style={styles.sidebarBusinessName}>
                {props.activeBusiness?.name ?? 'לא נבחר עסק'}
              </Text>
            </View>
            <NavList
              currentPathname={props.currentPathname}
              onNavigate={props.onNavigate}
            />
            <View style={styles.sidebarSpacer} />
            <AccountBlock
              displayName={props.displayName}
              email={props.email}
              isSigningOut={props.isSigningOut}
              onLogout={props.onLogout}
            />
          </View>
        ) : null}

        <View style={styles.mainColumn}>
          <View
            role="banner"
            style={[
              styles.topbar,
              isMobileComposition ? styles.topbarMobile : null,
            ]}
          >
            {isCompact ? (
              <Pressable
                accessibilityLabel={
                  isMobileMenuOpen ? 'סגירת תפריט' : 'פתיחת תפריט'
                }
                accessibilityRole="button"
                accessibilityState={{ expanded: isMobileMenuOpen }}
                onPress={() => toggleOverlay('navigation')}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed ? styles.controlPressed : null,
                ]}
              >
                {isMobileMenuOpen ? (
                  <X color={TOKENS.colors.textPrimary} size={22} />
                ) : (
                  <Menu color={TOKENS.colors.textPrimary} size={22} />
                )}
              </Pressable>
            ) : (
              <BusinessSwitcher
                activeBusiness={props.activeBusiness}
                activeBusinessId={props.activeBusinessId}
                businesses={props.businesses}
                compact={false}
                isOpen={isBusinessMenuOpen}
                isSwitchingBusiness={props.isSwitchingBusiness}
                onOpenChange={(isOpen) =>
                  setActiveOverlay(isOpen ? 'business' : null)
                }
                onSelectBusiness={props.onSelectBusiness}
                popoverWidth={popoverWidth}
                selectError={props.selectError}
                showBrandMark={false}
                showClosedError={activeOverlay === null}
              />
            )}

            {isCompact ? (
              <BusinessSwitcher
                activeBusiness={props.activeBusiness}
                activeBusinessId={props.activeBusinessId}
                businesses={props.businesses}
                compact={true}
                isOpen={isBusinessMenuOpen}
                isSwitchingBusiness={props.isSwitchingBusiness}
                onOpenChange={(isOpen) =>
                  setActiveOverlay(isOpen ? 'business' : null)
                }
                onSelectBusiness={props.onSelectBusiness}
                popoverWidth={popoverWidth}
                selectError={props.selectError}
                showBrandMark={isMobileComposition}
                showClosedError={activeOverlay === null}
              />
            ) : (
              <View style={styles.topbarSpacer} />
            )}

            <View style={styles.accountMenuWrap}>
              <Pressable
                accessibilityLabel="פתיחת תפריט החשבון"
                accessibilityRole="button"
                accessibilityState={{ expanded: isAccountMenuOpen }}
                onPress={() => toggleOverlay('account')}
                style={({ pressed }) => [
                  styles.avatarButton,
                  pressed ? styles.controlPressed : null,
                ]}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </Pressable>
              {isAccountMenuOpen ? (
                <View
                  style={[
                    styles.accountMenu,
                    isCompact ? { width: popoverWidth } : null,
                  ]}
                  accessibilityRole="menu"
                >
                  <AccountBlock
                    compact={true}
                    displayName={props.displayName}
                    email={props.email}
                    isSigningOut={props.isSigningOut}
                    onLogout={() => {
                      setActiveOverlay(null);
                      props.onLogout();
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>

          {activeOverlay === 'account' || activeOverlay === 'business' ? (
            <Pressable
              accessibilityLabel="סגירת התפריט הפתוח"
              accessibilityRole="button"
              onPress={() => setActiveOverlay(null)}
              style={[styles.popoverBackdrop, { top: topbarHeight }]}
            />
          ) : null}

          {isCompact && isMobileMenuOpen ? (
            <View
              accessibilityViewIsModal={true}
              style={[styles.mobileMenuOverlay, { top: topbarHeight }]}
            >
              <Pressable
                accessibilityLabel="סגירת תפריט הניווט"
                accessibilityRole="button"
                onPress={() => setActiveOverlay(null)}
                style={styles.mobileMenuBackdrop}
              />
              <View
                accessibilityLabel="תפריט ניווט עסקי"
                accessibilityRole="menu"
                style={[styles.mobileMenuDrawer, { width: drawerWidth }]}
              >
                <ScrollView
                  contentContainerStyle={styles.mobileMenuContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <NavList
                    compact={true}
                    currentPathname={props.currentPathname}
                    onNavigate={(href) => {
                      setActiveOverlay(null);
                      props.onNavigate(href);
                    }}
                  />
                  <AccountBlock
                    compact={true}
                    displayName={props.displayName}
                    email={props.email}
                    isSigningOut={props.isSigningOut}
                    onLogout={() => {
                      setActiveOverlay(null);
                      props.onLogout();
                    }}
                  />
                </ScrollView>
              </View>
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={[
              styles.content,
              isCompact ? styles.contentCompact : null,
              { paddingTop: responsiveLayout.pageTopPadding },
            ]}
            keyboardShouldPersistTaps="handled"
            role="main"
            tabIndex={0}
            accessibilityLabel="תוכן ראשי של העסק"
            style={styles.scroll}
          >
            {props.children}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: TOKENS.colors.pageBackground },
  shell: { flex: 1, flexDirection: flexDirection.row },
  shellCompact: { flexDirection: 'column' },
  sidebar: {
    width: 188,
    minWidth: 188,
    borderLeftWidth: 1,
    borderLeftColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.lg,
  },
  sidebarNarrow: { width: 180, minWidth: 180 },
  brandArea: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.md,
    paddingHorizontal: TOKENS.space.sm,
  },
  brandMark: {
    width: 26,
    height: 26,
    borderRadius: TOKENS.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primary,
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  brandCopy: { alignItems: alignItems.start },
  brandName: {
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  brandProduct: {
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sidebarBusiness: {
    marginTop: TOKENS.space.lg,
    marginBottom: TOKENS.space.md,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    paddingHorizontal: TOKENS.space.xs,
    paddingBottom: TOKENS.space.md,
  },
  sidebarEyebrow: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  sidebarBusinessName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  navList: { gap: TOKENS.space.xs },
  navItem: {
    minHeight: 44,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
    borderRadius: TOKENS.radii.md,
    paddingHorizontal: TOKENS.space.sm,
    opacity: 0.78,
  },
  navItemActive: { backgroundColor: '#F3F6FF', opacity: 1 },
  navItemCompact: { minHeight: 46 },
  navLabel: {
    ...rtlBaseText,
    flex: 1,
    color: TOKENS.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  navLabelActive: { color: TOKENS.colors.primary, fontWeight: '700' },
  soonLabel: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  sidebarSpacer: { flex: 1, minHeight: TOKENS.space.xl },
  accountBlock: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    paddingTop: TOKENS.space.lg,
  },
  accountBlockCompact: { borderTopWidth: 0, paddingTop: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: TOKENS.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: TOKENS.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderWidth: 1,
    borderColor: '#D7E1FF',
    cursor: 'pointer',
  },
  avatarText: { color: TOKENS.colors.primary, fontSize: 13, fontWeight: '800' },
  accountCopy: { flex: 1, minWidth: 0, alignItems: alignItems.start },
  accountName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  accountEmail: {
    ...ltrIslandText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: TOKENS.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: TOKENS.colors.pageBackground,
  },
  topbar: {
    minHeight: 48,
    position: 'relative',
    zIndex: 50,
    overflow: 'visible',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: TOKENS.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: TOKENS.space.xs,
  },
  topbarMobile: {
    minHeight: 50,
    paddingHorizontal: TOKENS.space.md,
    paddingVertical: 4,
  },
  topbarSpacer: { flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: TOKENS.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
    cursor: 'pointer',
  },
  switcherWrap: { position: 'relative', zIndex: 70 },
  switcherWrapCompact: { flex: 1, minWidth: 0, maxWidth: 360 },
  switcherButton: {
    minWidth: 168,
    maxWidth: 220,
    minHeight: 44,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.elevatedSurface,
    paddingHorizontal: TOKENS.space.sm,
    cursor: 'pointer',
  },
  switcherButtonStatic: { cursor: 'auto' },
  switcherButtonCompact: {
    width: '100%',
    minWidth: 0,
    maxWidth: 360,
    minHeight: 44,
  },
  switcherIcon: {
    width: 28,
    height: 28,
    borderRadius: TOKENS.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  switcherBrandMark: { backgroundColor: TOKENS.colors.primary },
  switcherBrandMarkText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  switcherCopy: { flex: 1, minWidth: 0, alignItems: alignItems.start },
  switcherName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  switcherMeta: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  switcherMenu: {
    position: 'absolute',
    top: 54,
    right: 0,
    width: 280,
    zIndex: 80,
    gap: TOKENS.space.xs,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.sm,
    ...TOKENS.shadow,
    elevation: 12,
  },
  switcherMenuCompact: { right: -48 },
  switcherOption: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: TOKENS.radii.sm,
    paddingHorizontal: TOKENS.space.md,
    cursor: 'pointer',
  },
  switcherOptionActive: { backgroundColor: TOKENS.colors.primarySubtle },
  switcherOptionName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  switcherOptionNameActive: { color: TOKENS.colors.primary },
  switcherOptionRole: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  selectError: {
    ...rtlBaseText,
    color: TOKENS.colors.danger,
    fontSize: 12,
    lineHeight: 18,
    padding: TOKENS.space.sm,
  },
  switcherError: {
    position: 'absolute',
    top: 54,
    right: 0,
    width: 280,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.dangerSubtle,
    ...TOKENS.shadow,
    zIndex: 80,
    elevation: 12,
  },
  accountMenuWrap: { position: 'relative', zIndex: 70 },
  accountMenu: {
    position: 'absolute',
    top: 50,
    left: 0,
    width: 280,
    zIndex: 80,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.md,
    ...TOKENS.shadow,
    elevation: 12,
  },
  popoverBackdrop: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  mobileMenuOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    overflow: 'hidden',
  },
  mobileMenuBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  mobileMenuDrawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    borderLeftWidth: 1,
    borderLeftColor: TOKENS.colors.border,
    backgroundColor: TOKENS.colors.elevatedSurface,
    ...TOKENS.shadow,
    elevation: 12,
  },
  mobileMenuContent: {
    flexGrow: 1,
    gap: TOKENS.space.lg,
    padding: TOKENS.space.lg,
  },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: TOKENS.space.lg,
    paddingTop: 18,
    paddingBottom: 28,
  },
  contentCompact: {
    paddingHorizontal: TOKENS.space.lg,
  },
  controlPressed: { opacity: 0.72 },
});
