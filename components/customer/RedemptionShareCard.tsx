import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import RedemptionBusinessMark from '@/components/customer/RedemptionBusinessMark';
import type { RedemptionPresentation } from '@/lib/redemptionPresentation';
import {
  REDEMPTION_SHARE_HEIGHT,
  REDEMPTION_SHARE_WIDTH,
} from '@/lib/redemptionShare';
import {
  alignItems,
  flexDirection,
  ltrBaseText,
  rtlAutoText,
  rtlBaseText,
  selfStart,
} from '@/lib/rtl';

export { REDEMPTION_SHARE_HEIGHT, REDEMPTION_SHARE_WIDTH };

type RedemptionShareCardProps = {
  presentation: RedemptionPresentation;
  style?: StyleProp<ViewStyle>;
};

const RedemptionShareCard = forwardRef<View, RedemptionShareCardProps>(
  function RedemptionShareCard({ presentation, style }, ref) {
    const { palette, copy } = presentation;

    return (
      <View
        ref={ref}
        collapsable={false}
        renderToHardwareTextureAndroid={true}
        style={[styles.artboard, style]}
        accessible={true}
        accessibilityLabel={`תצוגה מקדימה לשיתוף. ${presentation.accessibilityLabel}`}
      >
        <LinearGradient
          colors={[palette.surface, palette.surfaceAlt, palette.surface]}
          locations={[0, 0.56, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={styles.gradient}
        >
          <View
            style={[styles.glowLarge, { backgroundColor: palette.glow }]}
            accessible={false}
          />
          <View
            style={[styles.glowSmall, { backgroundColor: palette.accent }]}
            accessible={false}
          />
          <View
            style={[styles.keyline, { borderColor: palette.keyline }]}
            accessible={false}
          />

          <View style={styles.content}>
            <View style={styles.businessRow}>
              <RedemptionBusinessMark
                businessName={presentation.businessName}
                businessLogoUrl={presentation.businessLogoUrl}
                businessMonogram={presentation.businessMonogram}
                size={72}
                color={palette.onSurface}
                borderColor={palette.keyline}
              />
              <View style={styles.businessCopy}>
                <Text
                  style={[styles.businessName, { color: palette.onSurface }]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.3}
                >
                  {presentation.businessName}
                </Text>
                {presentation.programDisplayName ? (
                  <Text
                    style={[
                      styles.programName,
                      { color: palette.onSurfaceMuted },
                    ]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.3}
                  >
                    {presentation.programDisplayName}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.celebrationBlock}>
              <View
                style={[
                  styles.eyebrow,
                  {
                    backgroundColor: palette.accent,
                    borderColor: palette.keyline,
                  },
                ]}
              >
                <Text
                  style={[styles.eyebrowText, { color: palette.onAccent }]}
                  maxFontSizeMultiplier={1.25}
                >
                  {copy.eyebrow}
                </Text>
              </View>

              <View
                style={[
                  styles.successSeal,
                  {
                    borderColor: palette.accent,
                    backgroundColor: palette.glow,
                  },
                ]}
                accessible={false}
              >
                <Text
                  style={[styles.successGlyph, { color: palette.onSurface }]}
                  maxFontSizeMultiplier={1}
                >
                  ✓
                </Text>
              </View>

              <Text
                style={[styles.title, { color: palette.onSurface }]}
                numberOfLines={3}
                maxFontSizeMultiplier={1.35}
              >
                {copy.title}
              </Text>
              <Text
                style={[styles.body, { color: palette.onSurfaceMuted }]}
                numberOfLines={3}
                maxFontSizeMultiplier={1.35}
              >
                {copy.body}
              </Text>
            </View>

            <View
              style={[
                styles.rewardPanel,
                {
                  borderColor: palette.keyline,
                  backgroundColor: palette.glow,
                },
              ]}
            >
              <Text
                style={[styles.rewardLabel, { color: palette.onSurfaceMuted }]}
                maxFontSizeMultiplier={1.3}
              >
                {copy.benefitLabel}
              </Text>
              <Text
                style={[styles.rewardName, { color: palette.onSurface }]}
                numberOfLines={4}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.76}
                maxFontSizeMultiplier={1.35}
              >
                {presentation.rewardDisplayName}
              </Text>
            </View>

            <View style={styles.footer}>
              <Text
                style={[styles.footerCopy, { color: palette.onSurfaceMuted }]}
                maxFontSizeMultiplier={1.25}
              >
                רגע קטן שכיף לשתף
              </Text>
              <Text
                style={[styles.brand, { color: palette.onSurfaceMuted }]}
                maxFontSizeMultiplier={1.15}
              >
                StampAix
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }
);

export default RedemptionShareCard;

const styles = StyleSheet.create({
  artboard: {
    width: '100%',
    aspectRatio: REDEMPTION_SHARE_WIDTH / REDEMPTION_SHARE_HEIGHT,
    maxWidth: 420,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#111827',
  },
  gradient: {
    flex: 1,
    overflow: 'hidden',
  },
  glowLarge: {
    position: 'absolute',
    width: '96%',
    aspectRatio: 1,
    borderRadius: 999,
    top: '18%',
    right: '-38%',
    opacity: 0.76,
  },
  glowSmall: {
    position: 'absolute',
    width: '42%',
    aspectRatio: 1,
    borderRadius: 999,
    bottom: '10%',
    left: '-18%',
    opacity: 0.12,
  },
  keyline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 30,
  },
  content: {
    flex: 1,
    paddingHorizontal: '8%',
    paddingTop: '9%',
    paddingBottom: '7%',
    justifyContent: 'space-between',
  },
  businessRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 14,
  },
  businessCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 3,
  },
  businessName: {
    width: '100%',
    ...rtlAutoText,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  programName: {
    width: '100%',
    ...rtlBaseText,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  celebrationBlock: {
    alignItems: alignItems.start,
    gap: 12,
  },
  eyebrow: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 7,
    alignSelf: selfStart,
  },
  eyebrowText: {
    ...rtlBaseText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  successSeal: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successGlyph: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    width: '100%',
    ...rtlBaseText,
    fontSize: 35,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  body: {
    width: '100%',
    ...rtlBaseText,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
  },
  rewardPanel: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 7,
  },
  rewardLabel: {
    width: '100%',
    ...rtlBaseText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  rewardName: {
    width: '100%',
    ...rtlAutoText,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  footer: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerCopy: {
    flex: 1,
    ...rtlBaseText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  brand: {
    ...ltrBaseText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
    opacity: 0.78,
  },
});
