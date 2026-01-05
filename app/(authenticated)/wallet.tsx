import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

type DemoCard = {
  id: string;
  businessName: string;
  subtitle: string;
  stampsCurrent: number;
  stampsGoal: number;
};

const demoCards: DemoCard[] = [
  { id: "cafe", businessName: "Cafe ניקוד+", subtitle: "קבל מתנה לאחר 8 ניקובים", stampsCurrent: 3, stampsGoal: 8 },
  { id: "bakery", businessName: "בייקרי לילה", subtitle: "חמישה קינוחים ב-40 ש״ח", stampsCurrent: 1, stampsGoal: 5 },
  { id: "library", businessName: "ספרייה מקומית", subtitle: "ניקוד כפול באירועים", stampsCurrent: 6, stampsGoal: 10 },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function WalletScreen() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return demoCards;
    return demoCards.filter((c) => c.businessName.includes(q) || c.subtitle.includes(q));
  }, [query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F6F8FC" }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", textAlign: "right", color: "#0B1220" }}>
            כרטיסיות הנאמנות שלי
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, textAlign: "right", color: "#5B6475" }}>
            כל הכרטיסיות שלך במקום אחד
          </Text>
        </View>

        <View
          style={{
            marginTop: 14,
            flexDirection: "row-reverse",
            gap: 10,
            alignItems: "center",
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row-reverse",
              alignItems: "center",
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E6EBF5",
              paddingHorizontal: 12,
              height: 46,
            }}
          >
            <Ionicons name="search" size={18} color="#7B879C" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חפש עסק או הטבה"
              placeholderTextColor="#9AA4B2"
              style={{
                flex: 1,
                textAlign: "right",
                marginRight: 8,
                color: "#0B1220",
                fontSize: 14,
              }}
            />
          </View>

          <Pressable
            onPress={() => {}}
            style={({ pressed }) => ({
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "#E6EBF5",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="options-outline" size={20} color="#2F6BFF" />
          </Pressable>
        </View>

        <View style={{ marginTop: 14, gap: 12 }}>
          {filtered.map((c) => {
            const pct = clamp((c.stampsCurrent / c.stampsGoal) * 100, 0, 100);

            return (
              <Pressable
                key={c.id}
                onPress={() =>
                  router.push({
                    pathname: "/(authenticated)/card",
                    params: {
                      businessName: c.businessName,
                      subtitle: c.subtitle,
                      stampsCurrent: String(c.stampsCurrent),
                      stampsGoal: String(c.stampsGoal),
                    },
                  })
                }
                style={({ pressed }) => ({
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#E6EBF5",
                  padding: 14,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        backgroundColor: "#F3F6FF",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "#E3E9FF",
                      }}
                    >
                      <Ionicons name="storefront-outline" size={20} color="#2F6BFF" />
                    </View>

                    <View style={{ maxWidth: 220 }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", textAlign: "right", color: "#0B1220" }}>
                        {c.businessName}
                      </Text>
                      <Text style={{ marginTop: 4, fontSize: 12, textAlign: "right", color: "#5B6475" }}>
                        {c.subtitle}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "#F3F6FF",
                      borderWidth: 1,
                      borderColor: "#E3E9FF",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#2F6BFF" }}>
                      {c.stampsCurrent}/{c.stampsGoal}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 12, height: 8, backgroundColor: "#E9EEF9", borderRadius: 999, overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: 8, backgroundColor: "#2F6BFF", borderRadius: 999 }} />
                </View>

                <View style={{ marginTop: 12, flexDirection: "row-reverse", justifyContent: "flex-start" }}>
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#2F6BFF",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>הצג כרטיסיה</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {filtered.length === 0 ? (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#E6EBF5",
                padding: 16,
                marginTop: 6,
              }}
            >
              <Text style={{ textAlign: "right", fontWeight: "800", color: "#0B1220" }}>לא נמצאו תוצאות</Text>
              <Text style={{ marginTop: 6, textAlign: "right", color: "#5B6475", fontSize: 12 }}>
                נסה חיפוש אחר או נקה את החיפוש.
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={{ marginTop: 14, textAlign: "right", color: "#8A94A6", fontSize: 11 }}>
          דמו זמני: בשלב הבא נחבר ל-Convex ונציג כרטיסיות אמיתיות.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
