import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function JoinScreen() {
  const insets = useSafeAreaInsets();
  const joinByBusinessQr = useMutation(api.memberships.joinByBusinessQr);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

  async function handleJoin(qrData: string) {
    if (busy) return;
    const data = (qrData ?? "").trim();
    if (!data) return;

    try {
      setBusy(true);
      await joinByBusinessQr({ qrData: data });
      router.replace("/wallet");
    } catch (e: any) {
      console.log("[JOIN] failed", e?.message ?? e);
      setScanned(false);
    } finally {
      setBusy(false);
    }
  }

  const granted = !!permission?.granted;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E9F0FF" }} edges={[]}>
      <View style={{ paddingTop: (insets.top || 0) + 16, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#1A2B4A", textAlign: "right" }}>
          הצטרפות למועדון
        </Text>
        <Text style={{ marginTop: 6, fontSize: 13, fontWeight: "700", color: "#2F6BFF", textAlign: "right" }}>
          סרוק QR של העסק כדי להצטרף
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 20 }}>
        {!permission ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ textAlign: "right", color: "#5B6475", fontWeight: "700" }}>
              טוען הרשאות מצלמה...
            </Text>
          </View>
        ) : !granted ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ textAlign: "right", color: "#0B1220", fontWeight: "900", fontSize: 16 }}>
              אין הרשאת מצלמה
            </Text>
            <Text style={{ marginTop: 6, textAlign: "right", color: "#5B6475", fontWeight: "700" }}>
              תן הרשאה למצלמה כדי לסרוק QR.
            </Text>

            <Pressable
              onPress={() => requestPermission()}
              style={({ pressed }) => ({
                marginTop: 12,
                alignSelf: "flex-start",
                backgroundColor: "#2F6BFF",
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>תן הרשאה</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "#E3E9FF" }}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={
                  scanned
                    ? undefined
                    : ({ data }) => {
                        setScanned(true);
                        handleJoin(String(data));
                      }
                }
              />

              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  top: 60,
                  height: 220,
                  borderRadius: 24,
                  borderWidth: 2,
                  borderColor: "rgba(47,107,255,0.85)",
                }}
              />
            </View>

            <View
              style={{
                marginTop: 14,
                backgroundColor: "#FFFFFF",
                borderRadius: 20,
                padding: 14,
                borderWidth: 1,
                borderColor: "#E3E9FF",
              }}
            >
              <Text style={{ textAlign: "right", fontWeight: "900", color: "#0B1220" }}>
                אין QR? הדבק קוד עסק
              </Text>

              <TextInput
                value={manual}
                onChangeText={setManual}
                placeholder="לדוגמה: businessExternalId:biz:123"
                placeholderTextColor="#9AA4B2"
                style={{
                  marginTop: 10,
                  height: 44,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#E3E9FF",
                  paddingHorizontal: 12,
                  textAlign: "right",
                  color: "#0B1220",
                  backgroundColor: "#F6F8FC",
                  fontWeight: "700",
                }}
              />

              <Pressable
                onPress={() => handleJoin(manual)}
                style={({ pressed }) => ({
                  marginTop: 10,
                  alignSelf: "flex-start",
                  backgroundColor: "#2F6BFF",
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{busy ? "בודק..." : "הצטרף"}</Text>
              </Pressable>

              <Pressable
                onPress={() => setScanned(false)}
                style={({ pressed }) => ({
                  marginTop: 8,
                  alignSelf: "flex-start",
                  backgroundColor: "#D4EDFF",
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: "#2F6BFF", fontWeight: "900" }}>סרוק שוב</Text>
              </Pressable>
            </View>
          </>
        )}

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            marginTop: 14,
            alignSelf: "flex-start",
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: "#E3E9FF",
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: "#1A2B4A", fontWeight: "900" }}>חזרה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
