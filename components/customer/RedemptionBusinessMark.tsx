import { useState } from 'react';
import {
  Image,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

type RedemptionBusinessMarkProps = {
  businessName: string;
  businessLogoUrl: string | null;
  businessMonogram: string;
  size?: number;
  color: string;
  borderColor: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

export default function RedemptionBusinessMark({
  businessName,
  businessLogoUrl,
  businessMonogram,
  size = 72,
  color,
  borderColor,
  backgroundColor = 'rgba(255,255,255,0.14)',
  style,
}: RedemptionBusinessMarkProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const shouldShowLogo =
    Boolean(businessLogoUrl) && failedLogoUrl !== businessLogoUrl;

  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.29),
          borderColor,
          backgroundColor,
        },
        style,
      ]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={`לוגו ${businessName}`}
    >
      <Text
        style={[
          styles.monogram,
          {
            color,
            fontSize: Math.round(size * 0.38),
            lineHeight: Math.round(size * 0.46),
          },
        ]}
        maxFontSizeMultiplier={1.2}
      >
        {businessMonogram}
      </Text>
      {shouldShowLogo && businessLogoUrl ? (
        <Image
          source={{ uri: businessLogoUrl }}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, styles.image]}
          onError={() => setFailedLogoUrl(businessLogoUrl)}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  monogram: {
    fontWeight: '900',
    textAlign: 'center',
  },
});
