import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

type QrScannerProps = {
  onScan: (data: string) => Promise<void> | void;
  resetKey?: number;
  isBusy?: boolean;
  caption?: string;
  style?: StyleProp<ViewStyle>;
};

export default function QrScanner({
  onScan,
  resetKey = 0,
  isBusy = false,
  caption,
  style,
}: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);

  useEffect(() => {
    if (permission === null || permission === undefined) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    setScanned(false);
    setInternalBusy(false);
  }, [resetKey]);

  const hasPermission = permission?.granted === true;

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      if (!data || scanned || isBusy || internalBusy || !hasPermission) {
        return;
      }
      setScanned(true);
      setInternalBusy(true);
      try {
        await onScan(String(data));
      } catch (error) {
        console.log("[QrScanner] scan handler failed", error);
        setScanned(false);
      } finally {
        setInternalBusy(false);
      }
    },
    [hasPermission, internalBusy, isBusy, onScan, scanned]
  );

  const statusLabel = useMemo(() => {
    if (caption) return caption;
    if (isBusy || internalBusy) return "מעדכן נתונים...";
    if (scanned) return "הקוד נסרק";
    return "סמן את ה-QR בתוך המסגרת";
  }, [caption, internalBusy, isBusy, scanned]);

  const renderPermissionFallback = () => {
    if (!permission) {
      return (
        <View style={styles.permissionFallback}>
          <ActivityIndicator color="#2F6BFF" />
          <Text style={styles.permissionTitle}>טוען הרשאות מצלמה...</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionFallback}>
          <Text style={styles.permissionTitle}>אין הרשאת מצלמה</Text>
          <Text style={styles.permissionText}>בקש הרשאה כדי להתחיל לסרוק.</Text>
          <Pressable onPress={requestPermission} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>תן הרשאה</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.cameraShell}>
        {hasPermission ? (
          <CameraView
            style={styles.cameraView}
            onBarcodeScanned={handleBarcode}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
        ) : (
          renderPermissionFallback()
        )}
        {hasPermission && <View pointerEvents="none" style={styles.overlay} />}
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{statusLabel}</Text>
        {(internalBusy || isBusy) && (
          <ActivityIndicator size="small" color="#2F6BFF" style={{ marginLeft: 6 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: "100%",
  },
  cameraShell: {
    flex: 1,
    minHeight: 300,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E3E9FF",
    backgroundColor: "#000",
  },
  cameraView: {
    flex: 1,
    minHeight: 300,
  },
  overlay: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 30,
    bottom: 30,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(47,107,255,0.85)",
  },
  permissionFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  permissionTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "800",
    color: "#0B1220",
    textAlign: "center",
  },
  permissionText: {
    marginTop: 6,
    fontSize: 13,
    color: "#5B6475",
    textAlign: "center",
  },
  permissionButton: {
    marginTop: 14,
    backgroundColor: "#2F6BFF",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  statusRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    fontSize: 13,
    color: "#5B6475",
    fontWeight: "700",
  },
});
