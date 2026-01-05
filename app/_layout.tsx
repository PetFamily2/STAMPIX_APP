import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import { getConvexUrl } from '@/utils/convexConfig';

// אסטרטגיית RTL (ראה docs/rtl-knowhow.md):
// 1. תוסף expo-localization (app.json) - מגדיר RTL ברמת ה-Native (עובד ב-Dev Builds ו-Production)
// 2. עיצוב RTL מפורש (lib/rtl.ts) - עובד בכל מקום כולל Expo Go
// 3. סידור ידני של טאבים - מטפל ב-Tab Bar בכל הסביבות
//
// הגישה ההיברידית מבטיחה תמיכה עקבית בעברית/RTL בכל הסביבות.

// שימוש בפונקציית הקונפיגורציה לבחירת כתובת Convex לפי הסביבה
const convexUrl = getConvexUrl();
const convex = new ConvexReactClient(convexUrl);

// אחסון מאובטח של הטוקן (Token) באמצעות expo-secure-store
// זה קריטי לשמירה על אבטחת המידע של המשתמש
const secureStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // טיפול שקט בשגיאות שמירה
    }
  },
  removeItem: async (key: string) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // טיפול שקט בשגיאות מחיקה
    }
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" translucent={false} backgroundColor="#0a0a0a" />
      <ConvexAuthProvider client={convex} storage={secureStorage}>
        <UserProvider>
          <RevenueCatProvider>
            <Slot />
          </RevenueCatProvider>
        </UserProvider>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
