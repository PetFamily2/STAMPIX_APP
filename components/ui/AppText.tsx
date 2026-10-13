import {
  Text as NativeText,
  Platform,
  type TextProps,
  type TextStyle,
} from 'react-native';

const WEB_HEEBO_TEXT_STYLE: TextStyle | undefined =
  Platform.OS === 'web'
    ? { fontFamily: 'Heebo', writingDirection: 'rtl', textAlign: 'right' }
    : undefined;

export function AppText({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={WEB_HEEBO_TEXT_STYLE ? [WEB_HEEBO_TEXT_STYLE, style] : style}
    />
  );
}
