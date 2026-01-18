import { api } from "@/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Tabs } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AuthenticatedLayout() {
  const insets = useSafeAreaInsets();

  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser);
  const createOrUpdateUser = useMutation(api.auth.createOrUpdateUser);

  const ran = useRef(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isLoading) return;

    // אם יש user, אין מה לעשות
    if (user && !bootError) return;

    // אם אין user (null) נריץ bootstrap פעם אחת
    if (user === null && !ran.current) {
      ran.current = true;
      setBooting(true);
      setBootError(null);

      const run = async () => {
        try {
          await Promise.race([
            createOrUpdateUser({}),
            new Promise((_, rej) => setTimeout(() => rej(new Error("bootstrap timeout")), 5000)),
          ]);
          setBootError(null);
        } catch (e: any) {
          setBootError(e?.message ?? String(e));
          ran.current = false; // לאפשר Retry
        } finally {
          setBooting(false);
        }
      };

      run();
    }
  }, [isAuthenticated, isLoading, user, bootError, createOrUpdateUser]);

  if (isLoading || booting || (isAuthenticated && user === undefined)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#E9F0FF", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontWeight: "800", color: "#1A2B4A" }}>טוען...</Text>
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#E9F0FF", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Text style={{ fontWeight: "900", color: "#D92D20", textAlign: "center" }}>שגיאת טעינת משתמש</Text>
        <Text style={{ marginTop: 8, color: "#5B6475", textAlign: "center" }}>{bootError}</Text>
        <Pressable
          onPress={() => {
            setBootError(null);
            ran.current = false;
          }}
          style={({ pressed }) => ({
            marginTop: 14,
            backgroundColor: "#2F6BFF",
            borderRadius: 16,
            paddingVertical: 12,
            paddingHorizontal: 18,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: "#2F6BFF",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          height: 60 + (insets.bottom || 0),
          paddingBottom: 8 + (insets.bottom || 0),
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#2F6BFF",
        tabBarInactiveTintColor: "#9AA4B8",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      {/* Customer tabs */}
      <Tabs.Screen
        name="wallet"
        options={{
          title: "ארנק",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: "הטבות",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="gift-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          title: "גילוי",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "פרופיל",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Hide non-tab routes */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="page1" options={{ href: null }} />
      <Tabs.Screen name="page2" options={{ href: null }} />
      <Tabs.Screen name="merchant" options={{ href: null }} />
      <Tabs.Screen name="business" options={{ href: null }} />

      {/* Card routes (IMPORTANT: must reference exact file routes) */}
      <Tabs.Screen name="card/index" options={{ href: null }} />
      <Tabs.Screen name="card/[membershipId]" options={{ href: null }} />

      {/* Full-screen scanner routes (hide tab bar) */}
      <Tabs.Screen
        name="join"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="business/scanner"
        options={{
          href: null,
          tabBarStyle: { display: "none" },
        }}
      />
    </Tabs>
  );
}
