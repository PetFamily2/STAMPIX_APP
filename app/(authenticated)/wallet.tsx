import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function WalletScreen() {
  const insets = useSafeAreaInsets();

  const memberships = useQuery(api.memberships.byCustomer);
  const createDemoMembershipForMe = useMutation(api.debug.createDemoMembershipForMe);

  const [creating, setCreating] = useState(false);
  const isLoading = memberships === undefined;

  async function handleCreateDemo() {
    if (creating) return;
    try {
      setCreating(true);
      await createDemoMembershipForMe({});
      // query הוא ריאקטיבי, אמור להתעדכן לבד
    } catch (e: any) {
      console.log("[WALLET] create demo failed", e?.message ?? e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[styles.scrollContainer, { paddingTop: (insets.top || 0) + 16 }]}
        alwaysBounceVertical={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.walletBadge}>
              <Ionicons name="qr-code-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerLabel}>DIGITAL WALLET</Text>
              <Text style={styles.headerTitle}>ישראל ישראלי ���</Text>
            </View>
            <Image
              source={require("../../assets/images/STAMPIX_LOGO.jpeg")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.ticker}>
            <Text style={styles.tickerText}>Reactive Live</Text>
          </View>
        </View>

        <Text style={styles.cardsTitle}>
          הכרטיסיות שלי ({isLoading ? "..." : memberships.length})
        </Text>

        {isLoading ? (
          <View style={styles.cardContainer}>
            <Text style={{ textAlign: "right", color: "#5B6475", fontWeight: "700" }}>
              טוען כרטיסיות...
            </Text>
          </View>
        ) : null}

        {!isLoading && memberships.length === 0 ? (
          <View style={styles.cardContainer}>
            <Text style={{ textAlign: "right", color: "#0B1220", fontWeight: "800", fontSize: 16 }}>
              עדיין אין כרטיסיות
            </Text>
            <Text style={{ marginTop: 6, textAlign: "right", color: "#5B6475", fontWeight: "600", fontSize: 13 }}>
              בשלב הבא תהיה הצטרפות דרך QR של עסק. כרגע אפשר ליצור כרטיסיית דמו בלחיצה אחת.
            </Text>

            <Pressable
              onPress={handleCreateDemo}
              style={({ pressed }) => ({
                marginTop: 12,
                alignSelf: "flex-start",
                backgroundColor: "#2F6BFF",
                borderRadius: 16,
                paddingVertical: 10,
                paddingHorizontal: 14,
                opacity: pressed ? 0.92 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                {creating ? "יוצר..." : "צור כרטיסיית דמו"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.cardList}>
          {!isLoading
            ? memberships.map((m: any) => {
                const current = Number(m.currentStamps ?? 0);
                const goal = Number(m.maxStamps ?? 10);
                const membershipId = String(m.membershipId);

                return (
                  <Pressable
                    key={membershipId}
                    style={styles.cardContainer}
                    onPress={() => router.push(`/(authenticated)/card/${membershipId}`)}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={[styles.progressLabel, { color: "#2F6BFF" }]}>
                        {current}/{goal}
                      </Text>

                      <View style={styles.cardTextColumn}>
                        <Text style={styles.cardTitle}>{m.businessName ?? "עסק"}</Text>
                        <Text style={styles.cardSubtitle}>הטבה: {m.rewardName ?? "הטבה"}</Text>
                      </View>

                      <View style={[styles.imagePlaceholder, { backgroundColor: "#E5EEFF" }]}>
                        <Image
                          source={require("../../assets/images/STAMPIX_LOGO.jpeg")}
                          style={styles.cardImage}
                          resizeMode="cover"
                        />
                      </View>
                    </View>

                    <View style={styles.stampRow}>
                      {Array.from({ length: goal }).map((_, index) => (
                        <View
                          key={`${membershipId}-${index}`}
                          style={[
                            styles.stampDot,
                            index < current
                              ? { backgroundColor: "#2F6BFF", borderColor: "#2F6BFF" }
                              : styles.stampDotEmpty,
                          ]}
                        />
                      ))}
                    </View>
                  </Pressable>
                );
              })
            : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#E9F0FF",
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  scrollBackground: {
    backgroundColor: "#E9F0FF",
  },
  header: {
    paddingVertical: 8,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#E3E9FF",
  },
  walletBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#2F6BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
    alignItems: "flex-end",
    marginRight: 12,
  },
  headerLabel: {
    fontSize: 11,
    textAlign: "right",
    letterSpacing: 1.5,
    color: "#2F6BFF",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A2B4A",
    textAlign: "right",
  },
  ticker: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#D4EDFF",
  },
  tickerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2F6BFF",
  },
  cardsTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A2B4A",
    textAlign: "right",
    marginBottom: 16,
  },
  cardList: {
    marginTop: 8,
    gap: 12,
  },
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E3E9FF",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTextColumn: {
    flex: 1,
    flexDirection: "column",
    gap: 2,
    marginHorizontal: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0B1220",
    flex: 1,
    textAlign: "right",
  },
  imagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E3E9FF",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#5B6475",
    textAlign: "right",
  },
  stampRow: {
    marginTop: 12,
    flexDirection: "row-reverse",
    gap: 8,
    flexWrap: "wrap",
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  stampDotEmpty: {
    borderColor: "#E5EAF5",
    backgroundColor: "#E9EEF9",
  },
});
