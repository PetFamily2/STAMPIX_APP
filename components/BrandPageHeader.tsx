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
        titleNumberOfLines={titleNumberOfLines}
      />
      {subtitle ? (
        <View style={styles.subtitleWrap}>
          <View style={styles.subtitleSpacer} />
          <View style={styles.subtitleTextWrap}>
            <Text
              style={[styles.subtitle, subtitleStyle]}
              numberOfLines={subtitleNumberOfLines}
            >
              {subtitle}
            </Text>
          </View>
        </View>
      ) : null}
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
  subtitleWrap: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  subtitleSpacer: {
    width: 106,
  },
  subtitleTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  subtitle: {
    textAlign: 'right',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: '#64748B',
  },
});
