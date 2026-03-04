import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

type CustomerBrandTitleRowProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  titleAccessory?: ReactNode;
};

export default function CustomerBrandTitleRow({
  title,
  style,
  titleStyle,
  titleAccessory,
}: CustomerBrandTitleRowProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.brand}>
        <Text style={styles.brandAccent}>S</Text>
        tamp
        <Text style={styles.brandAccent}>A</Text>
        ix
      </Text>
      <View style={styles.titleWrap}>
        {titleAccessory}
        <Text style={[styles.title, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    textAlign: 'right',
    fontSize: 22,
    lineHeight: 26,
    color: '#2F6BFF',
    fontWeight: '900',
  },
  brandAccent: {
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '900',
    color: '#2F6BFF',
  },
  titleWrap: {
    flex: 1,
    marginLeft: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
    flexShrink: 1,
  },
});
