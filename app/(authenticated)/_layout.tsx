import { useConvexAuth } from 'convex/react';
import { Redirect, Tabs, useRootNavigationState } from 'expo-router';
import {
  BarChart,
  Compass,
  FileScan,
  Home,
  Settings,
  Wallet,
} from 'lucide-react-native';
import { I18nManager } from 'react-native';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { useUser } from '@/contexts/UserContext';
import type { AppRole } from '@/lib/domain/roles';
import { BUSINESS_ROLES, CUSTOMER_ROLE } from '@/lib/hooks/useRoleGuard';
import { canAccessAdvancedFeatures } from '@/lib/domain/subscriptions';
import { IS_RTL } from '@/lib/rtl';

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth(); // בדיקת סטטוס האימות
  const navigationState = useRootNavigationState();
  const { user, isLoading: isUserLoading } = useUser();

  // המתנה לטעינת הניווט (מונע שגיאות בטעינה ראשונית)
  if (!navigationState?.key) {
    return <FullScreenLoading />;
  }

  // מסך טעינה בזמן בדיקת האימות
  if (isAuthLoading || isUserLoading) {
    return <FullScreenLoading />;
  }

  // הפניה לדף התחברות אם המשתמש לא מחובר
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  type TabConfig = {
    name: string;
    title: string;
    icon: React.ComponentType<{ size: number; color: string }>;
  };

  const customerTabs: TabConfig[] = [
    {
      name: 'wallet',
      title: 'ארנק',
      icon: Wallet,
    },
    {
      name: 'discovery',
      title: 'Discovery',
      icon: Compass,
    },
  ];

  const businessTabs: TabConfig[] = [
    {
      name: 'business/dashboard',
      title: 'לוח בקרה',
      icon: Home,
    },
    {
      name: 'business/scanner',
      title: 'סריקה',
      icon: FileScan,
    },
    {
      name: 'business/analytics',
      title: 'Analytics',
      icon: BarChart,
    },
    {
      name: 'settings',
      title: 'הגדרות',
      icon: Settings,
    },
  ];

  const role = (user.role ?? CUSTOMER_ROLE) as AppRole;
  const isBusinessUser = BUSINESS_ROLES.includes(role);
  const { subscriptionPlan } = useRevenueCat();
  const showAnalytics =
    isBusinessUser && canAccessAdvancedFeatures(subscriptionPlan);
  const baseTabs: TabConfig[] = isBusinessUser ? businessTabs : customerTabs;
  const effectiveTabs = isBusinessUser && !showAnalytics
    ? businessTabs.filter((tab) => tab.name !== 'business/analytics')
    : baseTabs;

  // אסטרטגיית סידור טאבים היברידית ל-RTL (ראה docs/rtl-knowhow.md):
  //
  // Native RTL (I18nManager.isRTL):
  // - true ב-Dev Builds ו-Production (התוסף expo-localization עובד)
  // - false ב-Expo Go (התוסף לא עובד)
  //
  // כאשר RTL טבעי (Native) מופעל, ה-Tab Bar הופך את הסדר אוטומטית
  // (הפריט הראשון מופיע בימין). לכן שומרים על סדר רגיל.
  //
  // כאשר RTL טבעי לא מופעל (Expo Go), אנחנו הופכים ידנית את המערך
  // כדי לקבל מראה RTL (ימין לשמאל).
  const isNativeRTLEnabled = I18nManager.isRTL === true;

  // קביעת סדר הטאבים בהתאם לסביבה
  const orderedTabs = isNativeRTLEnabled
    ? effectiveTabs
    : IS_RTL
      ? [...effectiveTabs].reverse()
      : effectiveTabs;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4fc3f7',
        tabBarInactiveTintColor: '#71717a',
        tabBarStyle: {
          backgroundColor: '#09090b',
          borderTopColor: '#27272a',
        },
      }}
    >
    {orderedTabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }: { color: string; size: number }) => (
              <tab.icon size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
