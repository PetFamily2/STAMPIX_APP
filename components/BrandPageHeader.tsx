import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import CustomerBrandTitleRow from '@/components/customer/CustomerBrandTitleRow';
import { rtlBaseText, rtlBaseView } from '@/lib/rtl';

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
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  titleAccessory,
  brandAccessory,
  titleNumberOfLines = 1,
  subtitleNumberOfLines = 2,
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
      {subtitle ? (
        <Text
          numberOfLines={subtitleNumberOfLines}
          style={[styles.subtitle, subtitleStyle]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 30,
    gap: 4,
    alignItems: 'stretch',
    ...rtlBaseView,
  },
  titleRow: {
    minHeight: 30,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748B',
    ...rtlBaseText,
  },
});
