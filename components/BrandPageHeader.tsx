import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import CustomerBrandTitleRow from '@/components/customer/CustomerBrandTitleRow';

type BrandPageHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
  brandAccessory?: ReactNode;
  titleNumberOfLines?: number;
  subtitleNumberOfLines?: number;
};

export default function BrandPageHeader({
  title,
  style,
  titleStyle,
  titleAccessory,
  brandAccessory,
  titleNumberOfLines = 1,
}: BrandPageHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <CustomerBrandTitleRow
        title={title}
        style={styles.titleRow}
        titleStyle={titleStyle}
        titleAccessory={titleAccessory}
        brandAccessory={brandAccessory}
        titleNumberOfLines={titleNumberOfLines}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 30,
    gap: 4,
  },
  titleRow: {
    minHeight: 30,
  },
});
