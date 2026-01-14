import React from "react";
import { View, Text, ScrollView, Pressable, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const walletCards = [
  {
    id: "louise",
    name: "קפה לואיז",
    benefit: "הטבה: קפה חינם",
    progress: 6,
    goal: 10,
    accent: "#2F6BFF",
    tint: "#E5EEFF",
  },
  {
    id: "brgr",
    name: "ברגריה",
    benefit: "הטבה: תוספות 10 חינם",
    progress: 2,
    goal: 10,
    accent: "#F47818",
    tint: "#FFF1E4",
  },
];

export default function WalletScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={styles.scrollContainer}
        alwaysBounceVertical={false}
      >
        {/* Header - ללא מסגרת, ישירות על הרקע */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.walletBadge}>
              <Ionicons name="qr-code-outline" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerLabel}>DIGITAL WALLET</Text>
              <Text style={styles.headerTitle}>ישראל ישראלי 👋</Text>
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

        {/* כותרת כרטיסיות */}
        <Text style={styles.cardsTitle}>הכרטיסיות שלי ({walletCards.length})</Text>

        <View style={styles.cardList}>
          {walletCards.map((card) => (
            <View key={card.id} style={styles.cardContainer}>
              <View style={styles.cardTopRow}>
                <Text style={styles.progressLabel}>
                  {card.progress}/{card.goal}
                </Text>
                <View style={styles.cardTextColumn}>
                  <Text style={styles.cardTitle}>{card.name}</Text>
                  <Text style={styles.cardSubtitle}>{card.benefit}</Text>
                </View>
                <View style={[styles.imagePlaceholder, { backgroundColor: card.tint }]}>
                  <Image
                    source={require("../../assets/images/STAMPIX_LOGO.jpeg")}
                    style={styles.cardImage}
                    resizeMode="cover"
                  />
                </View>
              </View>

              <View style={styles.stampRow}>
                {Array.from({ length: card.goal }).map((_, index) => (
                  <View
                    key={`${card.id}-${index}`}
                    style={[
                      styles.stampDot,
                      index < card.progress
                        ? { backgroundColor: card.accent, borderColor: card.accent }
                        : styles.stampDotEmpty,
                    ]}
                  />
                ))}
              </View>

              <Pressable style={({ pressed }) => [styles.cardAction, pressed && styles.cardActionPressed]}>
                <Text style={styles.cardActionText}>הצג כרטיסיה</Text>
              </Pressable>
            </View>
          ))}
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
    paddingTop: 16,
    paddingBottom: 120,
  },
  scrollBackground: {
    backgroundColor: "#E9F0FF",
  },
  header: {
    // ללא מסגרת - ישירות על הרקע
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
    color: "#2F6BFF",
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
  cardAction: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#2F6BFF",
  },
  cardActionPressed: {
    opacity: 0.85,
  },
  cardActionText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  bottomNav: {
    marginTop: 28,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E3E9FF",
  },
  navItem: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
