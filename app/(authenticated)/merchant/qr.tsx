import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

export default function MerchantQRCodeScreen() {
  const insets = useSafeAreaInsets();
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [businessIndex, setBusinessIndex] = useState(0);
  const selectedBusiness = businesses[businessIndex] ?? businesses[0];

  useEffect(() => {
    if (businesses.length === 0) {
      setBusinessIndex(0);
      return;
    }
    if (businessIndex >= businesses.length) {
      setBusinessIndex(0);
    }
  }, [businessIndex, businesses.length]);

  const qrPayload = selectedBusiness
    ? `businessExternalId:${selectedBusiness.externalId}`
    : null;
  const qrUri = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        qrPayload
      )}`
    : null;

  const handleShare = async () => {
    if (!qrPayload) return;
    await Share.share({ message: qrPayload });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E9F0FF" }} edges={[]}>
      <ScrollView
        style={{ backgroundColor: "#E9F0FF" }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 16,
          paddingBottom: (insets.bottom || 0) + 24,
          gap: 16,
        }}
      >
        <View>
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#1A2B4A", textAlign: "right" }}>
            QR לעסק
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#2F6BFF", textAlign: "right", fontWeight: "600" }}>
            הצג את הקוד כדי שלקוח יוכל להצטרף
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#E3E9FF",
            padding: 16,
            shadowColor: "#000",
            shadowOpacity: 0.03,
            shadowRadius: 10,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#0B1220", textAlign: "right" }}>
            כרטיס QR קבוע
          </Text>
          <Text style={{ marginTop: 6, fontSize: 12, fontWeight: "600", color: "#5B6475", textAlign: "right" }}>
            {selectedBusiness ? selectedBusiness.name : "טוען עסק..."}
          </Text>
          {selectedBusiness ? (
            <Text style={{ marginTop: 2, fontSize: 11, color: "#5B6475", textAlign: "right" }}>
              {selectedBusiness.externalId}
            </Text>
          ) : null}

          <View
            style={{
              marginTop: 12,
              alignSelf: "center",
              width: 240,
              height: 240,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#E3E9FF",
              backgroundColor: "#FFFFFF",
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {qrUri ? (
              <Image source={{ uri: qrUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
            ) : (
              <ActivityIndicator color="#2F6BFF" />
            )}
          </View>

          <Pressable
            onPress={handleShare}
            disabled={!qrPayload}
            style={({ pressed }) => ({
              marginTop: 12,
              alignSelf: "flex-start",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: "#2F6BFF",
              opacity: pressed || !qrPayload ? 0.7 : 1,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>שתף/העתק</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
