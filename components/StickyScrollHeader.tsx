import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

type StickyScrollHeaderProps = {
  topPadding: number;
  backgroundColor: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function StickyScrollHeader({
  topPadding,
  backgroundColor,
  children,
  style,
}: StickyScrollHeaderProps) {
  return (
    <View
      collapsable={false}
      style={[
        styles.container,
        { paddingTop: topPadding, backgroundColor },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    zIndex: 10,
    overflow: 'visible',
    flexShrink: 0,
  },
});
