import type { Href } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { resolveClassicStampPalette } from '@/lib/loyalty/classicStampPalette';
import { alignItems, flexDirection, rtlBaseText } from '@/lib/rtl';

type LoyaltyManagementEntryProps = {
  businessName: string;
  logoUrl: string | null;
  title: string;
  lifecycleLabel: string;
  lifecycle: string;
  maxStamps: number;
  memberCount: number;
  themeId: string | null;
  canEdit: boolean;
  onEdit: () => void;
  onDetails: () => void;
  progress: { kind: 'none' };
};

export function LoyaltyManagementEntry({
  businessName,
  logoUrl,
  title,
  lifecycleLabel,
  lifecycle,
  maxStamps,
  memberCount,
  themeId,
  canEdit,
  onEdit,
  onDetails,
  progress,
}: LoyaltyManagementEntryProps) {
  const palette = resolveClassicStampPalette(themeId);
  const initial = businessName.trim().charAt(0) || 'ע';
  void progress;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`${title}. ${lifecycleLabel}. ${maxStamps} חותמות. ${memberCount} חברים.`}
        accessibilityRole="button"
        onPress={onDetails}
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
      >
        <View style={[styles.thumb, { backgroundColor: palette.paper }]}>
          {logoUrl ? (
            <Image
              accessibilityLabel={`לוגו ${businessName}`}
              source={{ uri: logoUrl }}
              style={styles.thumbLogo}
            />
          ) : (
            <Text style={[styles.thumbInitial, { color: palette.ink }]}>
              {initial}
            </Text>
          )}
          <Text style={[styles.thumbTarget, { color: palette.ink }]}>
            {maxStamps}
          </Text>
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {businessName}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {maxStamps} חותמות · {memberCount} חברים
          </Text>
          <Text
            style={[
              styles.badge,
              lifecycle === 'active' ? styles.badgeLive : null,
              lifecycle === 'draft' ? styles.badgeDraft : null,
            ]}
          >
            {lifecycleLabel}
          </Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        {canEdit ? (
          <PwaButton
            accessibilityLabel={`עריכת ${title}`}
            label="עריכה"
            onPress={onEdit}
          />
        ) : null}
        <PwaButton
          accessibilityLabel={`פרטי ${title}`}
          label="פרטים"
          onPress={onDetails}
          variant="secondary"
        />
      </View>
    </View>
  );
}

export function loyaltyManagementHref(
  programId: string,
  businessId: string
): Href {
  return {
    pathname: '/business/cards/[programId]',
    params: { programId, businessId },
  } as Href;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    gap: 10,
    minHeight: 108,
    padding: 8,
  },
  main: {
    alignItems: 'center',
    flex: 1,
    flexDirection: flexDirection.row,
    gap: 10,
    minWidth: 0,
  },
  pressed: { opacity: 0.94 },
  thumb: {
    alignItems: 'center',
    borderRadius: 8,
    height: 88,
    justifyContent: 'center',
    width: 64,
  },
  thumbInitial: { fontSize: 16, fontWeight: '700', lineHeight: 20 },
  thumbLogo: { borderRadius: 6, height: 28, width: 28 },
  thumbTarget: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  copy: { alignItems: alignItems.start, flex: 1, gap: 2, minWidth: 0 },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  meta: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  badgeLive: { color: TOKENS.colors.success },
  badgeDraft: { color: TOKENS.colors.warning },
  actions: { gap: 6, width: 92 },
});
