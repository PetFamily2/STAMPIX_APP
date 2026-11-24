import { Image, Platform, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { BRAND_IMAGE_LOGO } from '@/config/branding';
import { flexDirection, ltrBaseText } from '@/lib/rtl';

type StampAixBrandProps = {
  product?: 'Business' | 'Admin';
  size?: 'compact' | 'regular';
  showMark?: boolean;
};

/** One mark and one wordmark. Never draw a generic S tile around the original brand. */
export function StampAixBrand({
  product,
  size = 'regular',
  showMark = true,
}: StampAixBrandProps) {
  const markSize = size === 'compact' ? 28 : 42;
  const nameSize = size === 'compact' ? 14 : 18;
  return (
    <View
      style={styles.row}
      accessible={true}
      accessibilityLabel={product ? `StampAix ${product}` : 'StampAix'}
    >
      {showMark ? (
        <View
          style={[
            styles.mark,
            { width: markSize, height: markSize, borderRadius: markSize / 2 },
          ]}
        >
          <Image
            source={BRAND_IMAGE_LOGO}
            resizeMode="contain"
            accessible={false}
            style={{
              width: markSize,
              height: markSize,
              borderRadius: markSize / 2,
            }}
          />
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text
          style={[
            styles.wordmark,
            { fontSize: nameSize, lineHeight: nameSize + 5 },
          ]}
        >
          StampAix
        </Text>
        {product ? <Text style={styles.product}>{product}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  mark: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'flex-start', direction: 'ltr' },
  wordmark: {
    color: '#1230A8',
    fontWeight: '700',
    ...(Platform.OS === 'web' ? { fontFamily: 'Heebo' } : {}),
    ...ltrBaseText,
  },
  product: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    ...ltrBaseText,
  },
});
