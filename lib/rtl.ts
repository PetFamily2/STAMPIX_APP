/**
 * RTL helpers for a Hebrew-first app.
 *
 * React Native native RTL is the single source of truth. These helpers expose
 * logical start/end names so UI code does not hard-code physical sides.
 */

import type { FlexStyle, TextStyle, ViewStyle } from 'react-native';

export const IS_RTL = true;

export const RTL_ARCHITECTURE_MARKER =
  'stampaix-rtl-native-v2-navigator-containers';

export const flexDirection = {
  row: 'row' as FlexStyle['flexDirection'],
  rowReverse: 'row-reverse' as FlexStyle['flexDirection'],
  col: 'column' as FlexStyle['flexDirection'],
  colReverse: 'column-reverse' as FlexStyle['flexDirection'],
};

export const textAlign = {
  start: 'right' as TextStyle['textAlign'],
  end: 'left' as TextStyle['textAlign'],
  center: 'center' as TextStyle['textAlign'],
};

export const justifyContent = {
  start: 'flex-start' as FlexStyle['justifyContent'],
  end: 'flex-end' as FlexStyle['justifyContent'],
  center: 'center' as FlexStyle['justifyContent'],
  between: 'space-between' as FlexStyle['justifyContent'],
  around: 'space-around' as FlexStyle['justifyContent'],
  evenly: 'space-evenly' as FlexStyle['justifyContent'],
};

export const alignItems = {
  start: 'flex-start' as FlexStyle['alignItems'],
  end: 'flex-end' as FlexStyle['alignItems'],
  center: 'center' as FlexStyle['alignItems'],
  stretch: 'stretch' as FlexStyle['alignItems'],
};

export const contentStart = alignItems.start;
export const contentEnd = alignItems.end;
export const selfStart = 'flex-start' as ViewStyle['alignSelf'];
export const selfEnd = 'flex-end' as ViewStyle['alignSelf'];

export const spacing = {
  marginStart: (value: number): ViewStyle => ({ marginStart: value }),
  marginEnd: (value: number): ViewStyle => ({ marginEnd: value }),
  paddingStart: (value: number): ViewStyle => ({ paddingStart: value }),
  paddingEnd: (value: number): ViewStyle => ({ paddingEnd: value }),
};

export const position = {
  start: (value: number): ViewStyle => ({ start: value }),
  end: (value: number): ViewStyle => ({ end: value }),
};

export const tw = {
  flexRow: 'flex-row',

  textStart: 'text-right',
  textEnd: 'text-left',

  justifyStart: 'justify-start',
  justifyEnd: 'justify-end',

  itemsStart: 'items-start',
  itemsEnd: 'items-end',

  selfStart: 'self-start',
  selfEnd: 'self-end',

  ps: (size: number | string) => `ps-${size}`,
  pe: (size: number | string) => `pe-${size}`,

  ms: (size: number | string) => `ms-${size}`,
  me: (size: number | string) => `me-${size}`,
};

export function rtlStyle<T extends ViewStyle | TextStyle>(
  ltrStyle: T,
  rtlStyleValue: T
): T {
  void ltrStyle;
  return rtlStyleValue;
}

export const iconTransform = {
  flipHorizontal: [{ scaleX: -1 }],
  rotate180: [{ rotate: '180deg' }],
};

export const rtlBaseView: ViewStyle = {
  direction: 'rtl',
};

export const rtlRouteContainerStyle: ViewStyle = {
  flex: 1,
  ...rtlBaseView,
};

export const rtlScreenContentStyle: ViewStyle = {
  flex: 1,
  ...rtlBaseView,
};

export const rtlTabSceneStyle: ViewStyle = {
  ...rtlScreenContentStyle,
};

export const rtlTabBarStyle: ViewStyle = {
  ...rtlBaseView,
};

export const rtlTabBarItemStyle: ViewStyle = {
  ...rtlBaseView,
};

export const rtlBaseText: TextStyle = {
  writingDirection: 'rtl',
  textAlign: 'right',
};

export const rtlAutoText: TextStyle = {
  writingDirection: 'auto',
  textAlign: 'right',
};

export const rtlCenterText: TextStyle = {
  writingDirection: 'rtl',
  textAlign: 'center',
};

export const ltrBaseText: TextStyle = {
  writingDirection: 'ltr',
  textAlign: 'left',
};

export const rtlRow: ViewStyle = {
  flexDirection: flexDirection.row,
  direction: 'rtl',
};

export const ltrIslandText: TextStyle = {
  ...ltrBaseText,
};

export const ltrIslandView: ViewStyle = {
  direction: 'ltr',
};
