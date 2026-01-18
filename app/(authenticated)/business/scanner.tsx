import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";

import { api } from "@/convex/_generated/api";
import QrScanner from "@/components/QrScanner";

const mapScanError = (error: unknown) => {
  if (error instanceof Error) {
    switch (error.message) {
      case "INVALID_QR":
        return "הקוד אינו תקין.";
      case "CUSTOMER_NOT_FOUND":
        return "הלקוח לא נמצא במערכת.";
      case "MEMBERSHIP_NOT_FOUND":
        return "אין מועדון פעיל עבור הלקוח.";
      case "NOT_AUTHORIZED":
        return "אין לך הרשאה לסרוק קוד זה.";
      default:
        return error.message;
    }
  }
  return "שגיאה לא צפויה. נסה שוב.";
};

export default function ScannerScreen() {
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
  }, [businesses.length, businessIndex]);

  const programs = useQuery(api.loyaltyPrograms.listByBusiness, {
    businessId: selectedBusiness?.businessId,
  }) ?? [];
  const [programIndex, setProgramIndex] = useState(0);
  const selectedProgram = programs[programIndex];

  useEffect(() => {
    if (programs.length === 0) {
      setProgramIndex(0);
      return;
    }
    if (programIndex >= programs.length) {
      setProgramIndex(0);
    }
  }, [programIndex, programs.length]);

  const resolveScan = useMutation(api.scanner.resolveScan);
  const addStamp = useMutation(api.scanner.addStamp);
  const [busy, setBusy] = useState(false);
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canScan = Boolean(selectedBusiness && selectedProgram);

  const handleScan = useCallback(
    async (rawData: string) => {
      if (busy) return;
      if (!canScan) {
        setStatusMessage("בחר עסק ותוכנית לפני הסריקה.");
        setScannerResetKey((prev) => prev + 1);
        return;
      }
      const data = rawData?.trim();
      if (!data) {
        setStatusMessage("הסריקו QR תקין.");
        setScannerResetKey((prev) => prev + 1);
        return;
      }

      setBusy(true);
      setStatusMessage(null);
      try {
        const resolved = await resolveScan({
          qrData: data,
          businessId: selectedBusiness!.businessId,
          programId: selectedProgram!.loyaltyProgramId,
        });

        await addStamp({
          businessId: selectedBusiness!.businessId,
          programId: selectedProgram!.loyaltyProgramId,
          customerUserId: resolved.customerUserId,
        });

        const membership = resolved.membership;
        const stampState = membership
          ? `${membership.currentStamps}/${membership.maxStamps}`
          : `1/${selectedProgram?.maxStamps ?? "?"}`;
        setStatusMessage(`${resolved.customerDisplayName} קיבל חותמת (${stampState})`);
      } catch (error) {
        console.log("[BUSINESS SCANNER] failed", error);
        setStatusMessage(mapScanError(error));
      } finally {
        setBusy(false);
        setScannerResetKey((prev) => prev + 1);
      }
    },
    [addStamp, busy, canScan, resolveScan, selectedBusiness, selectedProgram]
  );

  const cycleBusiness = () => {
    if (businesses.length <= 1) return;
    setBusinessIndex((prev) => (prev + 1) % businesses.length);
  };

  const cycleProgram = () => {
    if (programs.length <= 1) return;
    setProgramIndex((prev) => (prev + 1) % programs.length);
  };

  const handleRetry = () => {
    setScannerResetKey((prev) => prev + 1);
    setStatusMessage(null);
  };

  const headerCaption = useMemo(() => {
    if (!canScan) return "אין עסקים או תוכניות פעילים.";
    return "הצמד את ה-QR למסגרת והמתן לאישור.";
  }, [canScan]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E9F0FF" }} edges={["top"]}>
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <View
          style={{
            paddingTop: (insets.top || 0) + 16,
            paddingBottom: 12,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: "#1A2B4A", textAlign: "right" }}>
            סריקת לקוחות
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#2F6BFF", textAlign: "right", fontWeight: "600" }}>
            מצא את העסק והתוכנית הנכונים לפני הסריקה
          </Text>
          <Text style={{ marginTop: 6, fontSize: 13, color: "#5B6475", textAlign: "right" }}>{headerCaption}</Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable
            onPress={cycleBusiness}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E3E9FF",
              padding: 12,
              backgroundColor: selectedBusiness ? "#FFFFFF" : "#F0F4FF",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontWeight: "900", color: "#0B1220", textAlign: "center" }}>
              {selectedBusiness ? selectedBusiness.name : "אין עסקים"}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 11, color: "#5B6475", textAlign: "center" }}>
              {businesses.length > 1 ? "הקש כדי לבחור" : selectedBusiness?.externalId ?? ""}
            </Text>
          </Pressable>

          <Pressable
            onPress={cycleProgram}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E3E9FF",
              padding: 12,
              backgroundColor: selectedProgram ? "#FFFFFF" : "#F0F4FF",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontWeight: "900", color: "#0B1220", textAlign: "center" }}>
              {selectedProgram ? selectedProgram.title : "אין תוכניות"}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 11, color: "#5B6475", textAlign: "center" }}>
              {programs.length > 1 ? "הקש כדי לבחור" : "תוכנית ברירת מחדל"}
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingTop: 16 }}>
          <QrScanner onScan={handleScan} resetKey={scannerResetKey} isBusy={busy} />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: (insets.bottom || 0) + 16,
        }}
      >
        {statusMessage ? (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#E3E9FF",
              padding: 14,
            }}
          >
            <Text style={{ color: "#1A2B4A", fontWeight: "700", textAlign: "right" }}>{statusMessage}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Pressable
            onPress={handleRetry}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              backgroundColor: "#D4EDFF",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1,
              borderColor: "#8DC5FF",
            })}
          >
            <Text style={{ color: "#2F6BFF", fontWeight: "900" }}>סרוק שוב</Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
              borderWidth: 1,
              borderColor: "#E3E9FF",
              marginLeft: 10,
            })}
          >
            <Text style={{ color: "#1A2B4A", fontWeight: "900" }}>חזרה</Text>
          </Pressable>
        </View>

        {busy ? (
          <View style={{ marginTop: 12, alignItems: "center" }}>
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
