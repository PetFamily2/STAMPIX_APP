import React from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { Slot, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';
import '../global.css';

import { RevenueCatProvider } from '@/contexts/RevenueCatContext';
import { AppModeProvider } from '@/contexts/AppModeContext';
import { getConvexUrl } from '@/utils/convexConfig';
import * as UserCtx from '@/contexts/UserContext';

console.log('UserContext exports:', Object.keys(UserCtx));
console.log('typeof UserCtx.UserProvider:', typeof (UserCtx as any).UserProvider);

function Boot() {
  console.log('BOOT COMPONENT RENDER');
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'yellow' }}>
      <Text style={{ fontSize: 40, color: 'black' }}>BOOT OK</Text>
    </View>
  );
}

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

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.log('RootErrorBoundary caught', { error: error?.message, info });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' }}>
          <Text style={{ color: 'red', fontSize: 16 }}>
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  console.log('RootLayout render');
  const pathname = usePathname();
  console.log('[ROOT] pathname:', pathname);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" translucent={false} backgroundColor="#F6F8FC" />
      <ConvexAuthProvider client={convex} storage={secureStorage}>
        <UserCtx.UserProvider>
          <AppModeProvider>
            <RevenueCatProvider>
              <RootErrorBoundary>
                <Slot />
              </RootErrorBoundary>
            </RevenueCatProvider>
          </AppModeProvider>
        </UserCtx.UserProvider>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
