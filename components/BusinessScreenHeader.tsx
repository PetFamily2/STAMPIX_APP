import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import BrandPageHeader from '@/components/BrandPageHeader';

type BusinessScreenHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
};

export default function BusinessScreenHeader({
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  titleAccessory,
}: BusinessScreenHeaderProps) {
  return (
    <View style={[styles.headerRow, style]}>
      <BrandPageHeader
        title={title}
        subtitle={subtitle}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
        titleAccessory={titleAccessory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
});
