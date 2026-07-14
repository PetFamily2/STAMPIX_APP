import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import {
  alignItems,
  flexDirection,
  ltrBaseText,
  rtlAutoText,
  rtlBaseText,
  rtlBaseView,
} from '@/lib/rtl';

type CustomerBrandTitleRowProps = {
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

export default function CustomerBrandTitleRow({
  title,
  subtitle,
  style,
  titleStyle,
  subtitleStyle,
  titleAccessory,
  brandAccessory,
  titleNumberOfLines = 1,
  subtitleNumberOfLines = 2,
}: CustomerBrandTitleRowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleZone}>
        {titleAccessory}
        <View style={styles.titleTextBlock}>
          <Text
            style={[styles.title, titleStyle]}
            numberOfLines={titleNumberOfLines}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={subtitleNumberOfLines}
              style={[styles.subtitle, subtitleStyle]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
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
    gap: 12,
    ...rtlBaseView,
  },
  brandWrap: {
    flexDirection: flexDirection.rowReverse,
    alignItems: 'center',
    gap: 8,
    direction: 'ltr',
    flexShrink: 0,
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
  titleZone: {
    flex: 1,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    ...rtlBaseView,
  },
  titleTextBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#1A2B4A',
    width: '100%',
    ...rtlAutoText,
  },
  subtitle: {
    width: '100%',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748B',
    ...rtlBaseText,
  },
});
