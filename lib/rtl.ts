/**
 * RTL helpers for a Hebrew-first app.
 *
 * StampAix uses explicit manual RTL layout instead of native/runtime RTL
 * forcing. This keeps row order, text alignment, and tab order predictable
 * and avoids double inversion.
 */

import type { FlexStyle, TextStyle, ViewStyle } from 'react-native';

export const IS_RTL = true;

export const RTL_ARCHITECTURE_MARKER = 'stampaix-rtl-manual-row-right-v1';

export const flexDirection = {
  row: 'row-reverse' as FlexStyle['flexDirection'],
  rowReverse: 'row' as FlexStyle['flexDirection'],
  col: 'column' as FlexStyle['flexDirection'],
  colReverse: 'column-reverse' as FlexStyle['flexDirection'],
};

export const textAlign = {
  start: 'right' as TextStyle['textAlign'],
  end: 'left' as TextStyle['textAlign'],
  center: 'center' as TextStyle['textAlign'],
};

export const justifyContent = {
  start: 'flex-end' as FlexStyle['justifyContent'],
  end: 'flex-start' as FlexStyle['justifyContent'],
  center: 'center' as FlexStyle['justifyContent'],
  between: 'space-between' as FlexStyle['justifyContent'],
  around: 'space-around' as FlexStyle['justifyContent'],
  evenly: 'space-evenly' as FlexStyle['justifyContent'],
};

export const alignItems = {
  start: 'flex-end' as FlexStyle['alignItems'],
  end: 'flex-start' as FlexStyle['alignItems'],
  center: 'center' as FlexStyle['alignItems'],
  stretch: 'stretch' as FlexStyle['alignItems'],
};

export const contentStart = alignItems.start;
export const contentEnd = alignItems.end;
export const selfStart = 'flex-end' as ViewStyle['alignSelf'];
export const selfEnd = 'flex-start' as ViewStyle['alignSelf'];

export const spacing = {
  marginStart: (value: number): ViewStyle => ({ marginRight: value }),
  marginEnd: (value: number): ViewStyle => ({ marginLeft: value }),
  paddingStart: (value: number): ViewStyle => ({ paddingRight: value }),
  paddingEnd: (value: number): ViewStyle => ({ paddingLeft: value }),
};

export const position = {
  start: (value: number): ViewStyle => ({ right: value }),
  end: (value: number): ViewStyle => ({ left: value }),
};

export const tw = {
  flexRow: 'flex-row-reverse',

  textStart: 'text-right',
  textEnd: 'text-left',

  justifyStart: 'justify-end',
  justifyEnd: 'justify-start',

  itemsStart: 'items-end',
  itemsEnd: 'items-start',

  selfStart: 'self-end',
  selfEnd: 'self-start',

  ps: (size: number | string) => `pr-${size}`,
  pe: (size: number | string) => `pl-${size}`,

  ms: (size: number | string) => `mr-${size}`,
  me: (size: number | string) => `ml-${size}`,
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

export const rtlBaseView: ViewStyle = {};

export const rtlRouteContainerStyle: ViewStyle = {
  flex: 1,
};

export const rtlScreenContentStyle: ViewStyle = {
  flex: 1,
};

export const rtlTabSceneStyle: ViewStyle = {
  flex: 1,
};

export const rtlTabBarStyle: ViewStyle = {};

export const rtlTabBarItemStyle: ViewStyle = {};

export const rtlBaseText: TextStyle = {
  writingDirection: 'rtl',
  textAlign: 'right',
};

export const hebrewText = rtlBaseText;

export const rtlAutoText: TextStyle = {
  writingDirection: 'auto',
  textAlign: 'right',
};

export const hebrewAutoText = rtlAutoText;

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
};

export const hebrewContent: ViewStyle = {
  alignItems: alignItems.start,
};

export const hebrewSelf: ViewStyle = {
  alignSelf: selfStart,
};

export const hebrewRow: ViewStyle = {
  ...rtlRow,
};

export const ltrIslandText: TextStyle = {
  ...ltrBaseText,
};

export const ltrIslandView: ViewStyle = {
  direction: 'ltr',
};
