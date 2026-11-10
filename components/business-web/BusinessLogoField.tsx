import { useMutation } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection } from '@/lib/rtl';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type BusinessLogoFieldProps = {
  businessId: Id<'businesses'>;
  businessName: string;
  canEdit: boolean;
  expectedUpdatedAt: number | null;
  logoUrl: string | null;
  onRevision: (updatedAt: number) => void;
};

export function BusinessLogoField({
  businessId,
  businessName,
  canEdit,
  expectedUpdatedAt,
  logoUrl,
  onRevision,
}: BusinessLogoFieldProps) {
  const generateUploadUrl = useMutation(
    api.business.generateBusinessLogoUploadUrl
  );
  const setBusinessLogo = useMutation(api.business.setBusinessLogo);
  const [overrideUrl, setOverrideUrl] = useState<string | null | undefined>(
    undefined
  );
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const shownUrl = overrideUrl === undefined ? logoUrl : overrideUrl;
  const initial = businessName.trim().charAt(0) || 'ע';

  const chooseLogo = async () => {
    if (!canEdit || busy) {
      return;
    }
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    if (!asset?.uri) {
      return;
    }
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!ALLOWED_LOGO_TYPES.has(mimeType)) {
      setError('אפשר להעלות לוגו בפורמט JPG, PNG או WebP.');
      return;
    }
    if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_LOGO_BYTES) {
      setError('הלוגו גדול מדי. הגודל המרבי הוא 2MB.');
      return;
    }

    setBusy('upload');
    try {
      const { uploadUrl } = await generateUploadUrl({ businessId });
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!uploadResponse.ok) {
        throw new Error('UPLOAD_FAILED');
      }
      const payload = (await uploadResponse.json()) as {
        storageId?: Id<'_storage'>;
      };
      if (!payload.storageId) {
        throw new Error('UPLOAD_FAILED');
      }
      const saved = await setBusinessLogo({
        businessId,
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        storageId: payload.storageId,
      });
      setOverrideUrl(saved.logoUrl);
      onRevision(saved.updatedAt);
    } catch {
      setError('לא הצלחנו לשמור את לוגו העסק. נסו שוב.');
    } finally {
      setBusy(null);
    }
  };

  const removeLogo = async () => {
    if (!canEdit || busy || !shownUrl) {
      return;
    }
    setBusy('remove');
    setError('');
    try {
      const saved = await setBusinessLogo({
        businessId,
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        remove: true,
      });
      setOverrideUrl(null);
      onRevision(saved.updatedAt);
    } catch {
      setError('לא הצלחנו להסיר את הלוגו. נסו שוב.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>לוגו העסק</Text>
      <Text style={styles.helper}>
        הלוגו מופיע על כרטיסיות Classic Stamp ובעמודי העסק. זה לא תמונת
        כרטיסייה. אפשר להשאיר את השדה ריק, ואז יוצג שם העסק.
      </Text>
      <View style={styles.row}>
        {shownUrl ? (
          <Image
            accessibilityLabel={`לוגו ${businessName}`}
            source={{ uri: shownUrl }}
            style={styles.preview}
          />
        ) : (
          <View
            accessibilityLabel={`אין לוגו, מוצג ${businessName}`}
            style={styles.fallback}
          >
            <Text style={styles.fallbackText}>{initial}</Text>
          </View>
        )}
        <View style={styles.actions}>
          {canEdit ? (
            <Pressable
              accessibilityLabel={
                shownUrl ? 'החלפת לוגו העסק' : 'העלאת לוגו העסק'
              }
              accessibilityRole="button"
              accessibilityState={{
                busy: busy === 'upload',
                disabled: busy !== null,
              }}
              disabled={busy !== null}
              onPress={() => {
                void chooseLogo();
              }}
              style={({ pressed }) => [
                styles.primary,
                pressed ? styles.pressed : null,
                busy ? styles.disabled : null,
              ]}
            >
              {busy === 'upload' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>
                  {shownUrl ? 'החלפת לוגו' : 'העלאת לוגו'}
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.helper}>צפייה בלבד</Text>
          )}
          {canEdit && shownUrl ? (
            <Pressable
              accessibilityLabel="הסרת לוגו העסק"
              accessibilityRole="button"
              accessibilityState={{
                busy: busy === 'remove',
                disabled: busy !== null,
              }}
              disabled={busy !== null}
              onPress={() => {
                void removeLogo();
              }}
              style={({ pressed }) => [
                styles.secondary,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryText}>
                {busy === 'remove' ? 'מסירים…' : 'הסרת לוגו'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    color: TOKENS.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helper: {
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  row: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: 12,
  },
  preview: {
    backgroundColor: TOKENS.colors.subtleSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: 16,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  fallbackText: {
    color: TOKENS.colors.primary,
    fontSize: 28,
    fontWeight: '700',
  },
  actions: { flex: 1, gap: 8 },
  primary: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.md,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  secondary: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: TOKENS.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.6 },
});
