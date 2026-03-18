import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

type QrScannerProps = {
  onScan: (data: string) => Promise<void> | void;
  resetKey?: number;
  isBusy?: boolean;
  caption?: string;
  showStatus?: boolean;
  cameraMinHeight?: number;
  style?: StyleProp<ViewStyle>;
};

export default function QrScanner({
  onScan,
  resetKey = 0,
  isBusy = false,
  caption,
  showStatus = true,
  cameraMinHeight = 300,
  style,
}: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);
  const scanLockRef = useRef(false);

  useEffect(() => {
    if (permission === null || permission === undefined) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    void resetKey;
    setScanned(false);
    setInternalBusy(false);
    scanLockRef.current = false;
  }, [resetKey]);

  const hasPermission = permission?.granted === true;

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      if (
        !data ||
        scanned ||
        isBusy ||
        internalBusy ||
        !hasPermission ||
        scanLockRef.current
      ) {
        return;
      }
      scanLockRef.current = true;
      setScanned(true);
      setInternalBusy(true);
      try {
        await onScan(String(data));
      } catch {
        // Keep scanner locked until parent issues a reset via resetKey.
      } finally {
        setInternalBusy(false);
      }
    },
    [hasPermission, internalBusy, isBusy, onScan, scanned]
  );

  const statusLabel = useMemo(() => {
    if (caption) {
      return caption;
    }
    if (isBusy || internalBusy) {
      return '\u05de\u05e2\u05d3\u05db\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd';
    }
    if (scanned) {
      return '\u05d4\u05e7\u05d5\u05d3 \u05e0\u05e1\u05e8\u05e7';
    }
    return '\u05e1\u05de\u05df \u05d0\u05ea \u05d4-QR \u05d1\u05ea\u05d5\u05da \u05d4\u05de\u05e1\u05d2\u05e8\u05ea';
  }, [caption, internalBusy, isBusy, scanned]);

  const renderPermissionFallback = () => {
    if (!permission) {
      return (
        <View style={styles.permissionFallback}>
          <ActivityIndicator color="#2F6BFF" />
          <Text style={styles.permissionTitle}>
            ׳˜׳•׳¢׳ ׳”׳¨׳©׳׳•׳× ׳׳¦׳׳׳”
          </Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionFallback}>
          <Text style={styles.permissionTitle}>׳׳™׳ ׳”׳¨׳©׳׳× ׳׳¦׳׳׳”</Text>
          <Text style={styles.permissionText}>
            ׳‘׳§׳© ׳”׳¨׳©׳׳” ׳›׳“׳™ ׳׳”׳×׳—׳™׳ ׳׳¡׳¨׳•׳§
          </Text>
          <Pressable
            onPress={requestPermission}
            style={styles.permissionButton}
          >
            <Text style={styles.permissionButtonText}>׳×׳ ׳”׳¨׳©׳׳”</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.cameraShell, { minHeight: cameraMinHeight }]}>
        {hasPermission ? (
          <CameraView
            style={[styles.cameraView, { minHeight: cameraMinHeight }]}
            onBarcodeScanned={
              scanned || isBusy || internalBusy ? undefined : handleBarcode
            }
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
        ) : (
          renderPermissionFallback()
        )}
        {hasPermission ? (
          <View pointerEvents="none" style={styles.overlay}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
        ) : null}
      </View>
      {showStatus ? (
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>{statusLabel}</Text>
          {(internalBusy || isBusy) && (
            <ActivityIndicator
              size="small"
              color="#2F6BFF"
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
  },
  cameraShell: {
    flex: 1,
    minHeight: 300,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#000',
  },
  cameraView: {
    flex: 1,
    minHeight: 300,
  },
  overlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 30,
    bottom: 30,
    borderRadius: 24,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 14,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  permissionFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  permissionTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'center',
  },
  permissionText: {
    marginTop: 6,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 14,
    backgroundColor: '#2F6BFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 13,
    color: '#5B6475',
    fontWeight: '700',
  },
});
