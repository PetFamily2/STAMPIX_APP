import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

const QR_VALUE = "businessExternalId:biz:demo-1";

export default function BusinessJoinQrScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingTop: (insets.top || 0) + 16, paddingBottom: (insets.bottom || 0) + 24 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>QR להצטרפות לקוחות</Text>
          <Text style={styles.headerSubtitle}>הצג ללקוח כדי להצטרף למועדון</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>קוד הצטרפות קבוע</Text>
          <View style={styles.qrFrame}>
            <QRCode value={QR_VALUE} size={220} color="#1A2B4A" backgroundColor="#FFFFFF" />
          </View>
          <Text style={styles.qrText}>{QR_VALUE}</Text>
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
  scrollBackground: {
    backgroundColor: "#E9F0FF",
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1A2B4A",
    textAlign: "right",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2F6BFF",
    textAlign: "right",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E3E9FF",
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B1220",
    textAlign: "right",
  },
  qrFrame: {
    marginTop: 12,
    alignSelf: "center",
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E3E9FF",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  qrText: {
    marginTop: 10,
    fontSize: 11,
    color: "#5B6475",
    textAlign: "center",
  },
});
