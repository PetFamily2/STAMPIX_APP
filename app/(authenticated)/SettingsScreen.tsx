import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { router } from "expo-router";

import { api } from "@/convex/_generated/api";
import { useAppMode } from "@/contexts/AppModeContext";

function Row({
  title,
  subtitle,
  icon,
  danger,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: "#E3E9FF",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: danger ? "#FFE9E9" : "#F3F6FF",
            borderWidth: 1,
            borderColor: danger ? "#FFD0D0" : "#E3E9FF",
          }}
        >
          <Ionicons name={icon} size={20} color={danger ? "#D92D20" : "#2F6BFF"} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              textAlign: "right",
              color: danger ? "#D92D20" : "#0B1220",
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, fontSize: 12, textAlign: "right", color: "#5B6475" }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-back" size={18} color="#9AA4B8" />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const setMyRole = useMutation(api.users.setMyRole);
  const [roleBusy, setRoleBusy] = useState(false);
  const { appMode, setAppMode, isLoading: isAppModeLoading } = useAppMode();
  const [appModeBusy, setAppModeBusy] = useState(false);

  const handleAppModeChange = async (nextMode: "customer" | "business") => {
    if (isAppModeLoading || appModeBusy) return;
    if (nextMode === appMode) return;
    try {
      setAppModeBusy(true);
      await setAppMode(nextMode);
    } finally {
      setAppModeBusy(false);
    }
  };

  const handleSwitchToBusiness = async () => {
    if (roleBusy) return;
    try {
      setRoleBusy(true);
      await setMyRole({ role: "merchant" });
      router.push("/(authenticated)/(business)/business/dashboard");
    } finally {
      setRoleBusy(false);
    }
  };

  const handleSwitchToCustomer = async () => {
    if (roleBusy) return;
    try {
      setRoleBusy(true);
      await setMyRole({ role: "customer" });
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E9F0FF" }} edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 16,
          paddingBottom: 120,
          gap: 12,
        }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#E3E9FF",
            padding: 12,
          }}
        >
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable
              onPress={() => handleAppModeChange("business")}
              style={({ pressed }) => ({
                paddingHorizontal: 8,
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.7 : 1,
              })}
            >
              <Text style={{ fontWeight: "800", color: "#1A2B4A" }}>בעל עסק</Text>
            </Pressable>

            <Pressable
              onPress={() => handleAppModeChange(appMode === "customer" ? "business" : "customer")}
              style={({ pressed }) => ({
                width: 56,
                height: 30,
                borderRadius: 999,
                backgroundColor: "#D9DEE7",
                padding: 3,
                justifyContent: "center",
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "#FFFFFF",
                  alignSelf: appMode === "customer" ? "flex-end" : "flex-start",
                  shadowColor: "#000",
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              />
            </Pressable>

            <Pressable
              onPress={() => handleAppModeChange("customer")}
              style={({ pressed }) => ({
                paddingHorizontal: 8,
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.7 : 1,
              })}
            >
              <Text style={{ fontWeight: "800", color: "#1A2B4A" }}>לקוח</Text>
            </Pressable>
          </View>
          <Text style={{ marginTop: 8, fontSize: 11, color: "#5B6475", textAlign: "right" }}>
            מצב זה משנה את תפריט הטאבים
          </Text>
        </View>

        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#1A2B4A", textAlign: "right" }}>
            פרופיל והגדרות
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#2F6BFF", textAlign: "right", fontWeight: "600" }}>
            ניהול חשבון, תמיכה ומסמכים
          </Text>
        </View>

        {__DEV__ ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#5B6475", textAlign: "right" }}>
              DEV
            </Text>
            <Row
              title="מצב עסק"
              subtitle="מעבר למסך סורק עסק"
              icon="briefcase-outline"
              onPress={handleSwitchToBusiness}
            />
            <Row
              title="מצב לקוח"
              subtitle="חזרה לפרופיל לקוח"
              icon="person-outline"
              onPress={handleSwitchToCustomer}
            />
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#5B6475", textAlign: "right" }}>
            כללי
          </Text>
          <Row
            title="התראות"
            subtitle="ניהול הרשאות והתראות מהעסקים"
            icon="notifications-outline"
            onPress={() => {}}
          />
          <Row
            title="שפה ותצוגה"
            subtitle="עברית, RTL ותצוגה כללית"
            icon="language-outline"
            onPress={() => {}}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#5B6475", textAlign: "right" }}>
            תמיכה ומסמכים
          </Text>
          <Row
            title="תמיכה"
            subtitle="צור קשר או דווח על בעיה"
            icon="help-circle-outline"
            onPress={() => {}}
          />
          <Row
            title="תנאי שימוש"
            subtitle="מסמך חובה לחנויות"
            icon="document-text-outline"
            onPress={() => {}}
          />
          <Row
            title="מדיניות פרטיות"
            subtitle="מסמך חובה לחנויות"
            icon="shield-checkmark-outline"
            onPress={() => {}}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#5B6475", textAlign: "right" }}>
            חשבון
          </Text>
          <Row
            title="מחיקת חשבון"
            subtitle="חובה ל-App Store: דרך ברורה למחיקה"
            icon="trash-outline"
            danger
            onPress={() => {}}
          />
          <Row
            title="יציאה מהחשבון"
            subtitle="נתק את המשתמש במכשיר"
            icon="log-out-outline"
            danger
            onPress={() => {}}
          />
        </View>

        <Text style={{ marginTop: 6, textAlign: "right", color: "#8A94A6", fontSize: 11 }}>
          דמו זמני: בשלב הבא נחבר פעולות אמיתיות (פתיחת מסמכים, תמיכה, יציאה ומחיקה) ל-Convex.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
