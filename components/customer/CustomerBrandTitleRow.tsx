import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  flexDirection,
  ltrBaseText,
  rtlAutoText,
  rtlBaseView,
  spacing,
} from '@/lib/rtl';

type CustomerBrandTitleRowProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
  brandAccessory?: ReactNode;
  titleNumberOfLines?: number;
};

export default function CustomerBrandTitleRow({
  title,
  style,
  titleStyle,
  titleAccessory,
  brandAccessory,
  titleNumberOfLines = 1,
}: CustomerBrandTitleRowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleWrap}>
        {titleAccessory}
        <Text
          style={[styles.title, titleStyle]}
          numberOfLines={titleNumberOfLines}
        >
          {title}
        </Text>
      </View>
      <View style={styles.brandWrap}>
        {brandAccessory}
        <Text style={styles.brand}>
          <Text style={styles.brandAccent}>S</Text>
          tamp
          <Text style={styles.brandAccent}>A</Text>
          ix
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 30,
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: 'center',
    ...rtlBaseView,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    direction: 'ltr',
  },
  brand: {
    fontSize: 22,
    lineHeight: 26,
    color: '#2F6BFF',
    fontWeight: '900',
    ...ltrBaseText,
  },
  brandAccent: {
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '900',
    color: '#2F6BFF',
  },
  titleWrap: {
    flex: 1,
    ...spacing.marginEnd(12),
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    ...rtlBaseView,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#1A2B4A',
    flexShrink: 1,
    ...rtlAutoText,
  },
});
