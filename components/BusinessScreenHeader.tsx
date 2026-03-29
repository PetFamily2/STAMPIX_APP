import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import BrandPageHeader from '@/components/BrandPageHeader';

type BusinessScreenHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
  brandAccessory?: ReactNode;
  titleNumberOfLines?: number;
  subtitleNumberOfLines?: number;
};

export default function BusinessScreenHeader({
  title,
  subtitle,
  style,
  contentStyle,
  titleStyle,
  subtitleStyle,
  titleAccessory,
  brandAccessory,
  titleNumberOfLines,
  subtitleNumberOfLines,
}: BusinessScreenHeaderProps) {
  return (
    <View style={[styles.headerRow, style]}>
      <BrandPageHeader
        title={title}
        subtitle={subtitle}
        style={contentStyle}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
        titleAccessory={titleAccessory}
        brandAccessory={brandAccessory}
        titleNumberOfLines={titleNumberOfLines}
        subtitleNumberOfLines={subtitleNumberOfLines}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 8,
  },
});
