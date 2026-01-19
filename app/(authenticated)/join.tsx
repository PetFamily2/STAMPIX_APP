import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import QrScanner from "@/components/QrScanner";

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const joinByBusinessQr = useMutation(api.memberships.joinByBusinessQr);

  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    if (__DEV__) {
      console.log("[JOIN] Convex URL:", process.env.EXPO_PUBLIC_CONVEX_URL);
    }
  }, []);

  const getFriendlyError = (error: unknown) => {
    if (error instanceof Error) {
      switch (error.message) {
        case "INVALID_QR":
          return "הקוד אינו תקין. נסה שוב.";
        case "BUSINESS_NOT_FOUND":
          return "העסק לא נמצא. בדוק את הקוד.";
        case "PROGRAM_NOT_FOUND":
          return "אין תוכנית פעילה לעסק זה.";
        default:
          return "ההצטרפות נכשלה. נסה שוב.";
      }
    }
    return "אירעה שגיאה לא צפויה. נסה שוב.";
  };

  const handleJoin = useCallback(
    async (qrData: string) => {
      const data = (qrData ?? "").trim();
      if (!data) {
        setFeedback({ type: "error", message: "אנא הזן קוד עסק תקין." });
        return;
      }
      if (busy) return;
      setFeedback(null);
      try {
        setBusy(true);
        await joinByBusinessQr({ qrData: data });
        setManual("");
        setScannerResetKey((prev) => prev + 1);
        router.replace("/wallet");
      } catch (error) {
        console.log("[JOIN] failed", error);
        setFeedback({ type: "error", message: getFriendlyError(error) });
        setScannerResetKey((prev) => prev + 1);
      } finally {
        setBusy(false);
      }
    },
    [busy, joinByBusinessQr]
  );

  const handleManual = useCallback(() => {
    handleJoin(manual.trim());
  }, [handleJoin, manual]);

  const handleScan = useCallback(
    async (data: string) => {
      await handleJoin(data);
    },
    [handleJoin]
  );

  const handleRetryScan = () => {
    setScannerResetKey((prev) => prev + 1);
    setFeedback(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E9F0FF" }} edges={["top"]}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            paddingTop: (insets.top || 0) + 16,
            paddingHorizontal: 24,
            paddingBottom: 8,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#1A2B4A", textAlign: "right" }}>
            הצטרפות למועדון
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, fontWeight: "700", color: "#2F6BFF", textAlign: "right" }}>
            סרוק QR של העסק או הדבק קוד ייחודי
          </Text>
          {feedback ? (
            <Text
              style={{
                marginTop: 10,
                fontSize: 13,
                color: feedback.type === "error" ? "#D92D20" : "#0B922A",
                textAlign: "right",
              }}
            >
              {feedback.message}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12 }}>
          <QrScanner onScan={handleScan} resetKey={scannerResetKey} isBusy={busy} />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: (insets.bottom || 0) + 16,
        }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#E3E9FF",
            padding: 16,
          }}
        >
          <Text style={{ textAlign: "right", fontWeight: "900", color: "#0B1220" }}>
            אין QR? הדבק קוד עסק
          </Text>
            <TextInput
              value={manual}
              onChangeText={setManual}
              onSubmitEditing={handleManual}
              returnKeyType="done"
              keyboardType="default"
              placeholder="לדוגמה: businessExternalId:biz:demo-1"
              placeholderTextColor="#9AA4B2"
              style={{
                height: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E3E9FF",
                paddingHorizontal: 12,
                textAlign: "right",
                color: "#0B1220",
                backgroundColor: "#F6F8FC",
                fontWeight: "700",
                marginTop: 10,
              }}
            />

          <Pressable
            onPress={handleManual}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              backgroundColor: "#2F6BFF",
              opacity: pressed ? 0.85 : 1,
              marginTop: 12,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{busy ? "בודק..." : "הצטרף"}</Text>
          </Pressable>
          {__DEV__ ? (
            <Text
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#5B6475",
                textAlign: "left",
              }}
            >
              CTA_RENDERED
            </Text>
          ) : null}

          <Pressable
            onPress={handleRetryScan}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 11,
              backgroundColor: "#D4EDFF",
              opacity: pressed ? 0.85 : 1,
              marginTop: 10,
            })}
          >
            <Text style={{ color: "#2F6BFF", fontWeight: "900" }}>סרוק שוב</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            marginTop: 12,
            alignSelf: "flex-start",
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: "#E3E9FF",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#1A2B4A", fontWeight: "900" }}>חזרה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
