import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import CustomerBrandTitleRow from '@/components/customer/CustomerBrandTitleRow';

type BrandPageHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
};

export default function BrandPageHeader({
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  titleAccessory,
}: BrandPageHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <CustomerBrandTitleRow
        title={title}
        style={styles.titleRow}
        titleStyle={titleStyle}
        titleAccessory={titleAccessory}
      />
      {subtitle ? (
        <Text numberOfLines={1} style={[styles.subtitle, subtitleStyle]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 54,
    gap: 6,
  },
  titleRow: {
    minHeight: 30,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    minHeight: 18,
    fontWeight: '700',
    color: '#2F6BFF',
    textAlign: 'right',
  },
});
