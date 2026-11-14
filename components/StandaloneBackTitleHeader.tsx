import type { ReactNode } from 'react';
import {
  Platform,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { BackButton } from '@/components/BackButton';
import { AppText as Text } from '@/components/ui/AppText';
import { flexDirection } from '@/lib/rtl';

type StandaloneBackTitleHeaderProps = {
  title: string;
  subtitle?: string;
  onBackPress: () => void;
  leftAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleNumberOfLines?: number;
  subtitleNumberOfLines?: number;
  children?: ReactNode;
};

export function StandaloneBackTitleHeader({
  title,
  subtitle,
  onBackPress,
  leftAccessory,
  style,
  titleStyle,
  subtitleStyle,
  titleNumberOfLines,
  subtitleNumberOfLines,
  children,
}: StandaloneBackTitleHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        Platform.OS === 'web' ? styles.containerWeb : null,
        style,
      ]}
    >
      <View style={styles.titleRow}>
        <BackButton onPress={onBackPress} />
        <View style={styles.titleBlock}>
          <Text
            numberOfLines={titleNumberOfLines}
            style={[styles.title, titleStyle]}
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
          {children}
        </View>
      </View>

      {leftAccessory ? (
        <View
          style={[
            styles.leftAccessory,
            Platform.OS === 'web' ? styles.leftAccessoryWeb : null,
          ]}
        >
          {leftAccessory}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  containerWeb: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  title: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  leftAccessory: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftAccessoryWeb: {
    width: '100%',
    alignItems: 'stretch',
  },
});
