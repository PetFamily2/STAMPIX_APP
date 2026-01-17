import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

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
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#1A2B4A", textAlign: "right" }}>
            פרופיל והגדרות
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#2F6BFF", textAlign: "right", fontWeight: "600" }}>
            ניהול חשבון, תמיכה ומסמכים
          </Text>
        </View>

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
