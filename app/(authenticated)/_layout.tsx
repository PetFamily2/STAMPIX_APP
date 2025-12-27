import { useConvexAuth } from 'convex/react';
import { Redirect, Tabs, useRootNavigationState } from 'expo-router';
import { FileSpreadsheet, FileText, Home, Settings } from 'lucide-react-native';
import { ActivityIndicator, I18nManager, View } from 'react-native';
import { IS_RTL } from '@/lib/rtl';

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth(); // בדיקת סטטוס האימות
  const navigationState = useRootNavigationState();

  // המתנה לטעינת הניווט (מונע שגיאות בטעינה ראשונית)
  if (!navigationState?.key) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  // מסך טעינה בזמן בדיקת האימות
  if (isLoading) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#4fc3f7" />
      </View>
    );
  }

  // הפניה לדף התחברות אם המשתמש לא מחובר
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // הגדרת הטאבים בסדר לוגי (בית ראשון, ואז עמודים, ולבסוף הגדרות)
  const tabs = [
    {
      name: 'index',
      title: 'בית',
      icon: Home,
    },
    {
      name: 'page1',
      title: 'עמוד 1',
      icon: FileText,
    },
    {
      name: 'page2',
      title: 'עמוד 2',
      icon: FileSpreadsheet,
    },
    {
      name: 'settings',
      title: 'הגדרות',
      icon: Settings,
    },
  ];

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
    ? tabs // Native RTL הופך אוטומטית - שומרים על סדר רגיל
    : IS_RTL
      ? [...tabs].reverse() // הופכים ידנית עבור Expo Go
      : tabs; // LTR - שומרים על סדר רגיל

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
