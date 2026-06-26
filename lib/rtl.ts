/**
 * RTL helpers for a Hebrew-first app.
 *
 * React Native native RTL is the preferred path. If the runtime still reports
 * LTR, these helpers provide a manual fallback for shared row/start/end usage.
 */

import type { FlexStyle, TextStyle, ViewStyle } from 'react-native';
import { I18nManager } from 'react-native';

export const IS_RTL = true;
export const IS_NATIVE_RTL = I18nManager.isRTL;
export const NEEDS_MANUAL_RTL = IS_RTL && !IS_NATIVE_RTL;

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

export const flexDirection = {
  row: (NEEDS_MANUAL_RTL ? 'row-reverse' : 'row') as FlexStyle['flexDirection'],
  rowReverse: (NEEDS_MANUAL_RTL
    ? 'row'
    : 'row-reverse') as FlexStyle['flexDirection'],
  col: 'column' as FlexStyle['flexDirection'],
  colReverse: 'column-reverse' as FlexStyle['flexDirection'],
};

export const textAlign = {
  start: (IS_RTL ? 'right' : 'left') as TextStyle['textAlign'],
  end: (IS_RTL ? 'left' : 'right') as TextStyle['textAlign'],
  center: 'center' as TextStyle['textAlign'],
};

export const justifyContent = {
  start: (NEEDS_MANUAL_RTL
    ? 'flex-end'
    : 'flex-start') as FlexStyle['justifyContent'],
  end: (NEEDS_MANUAL_RTL
    ? 'flex-start'
    : 'flex-end') as FlexStyle['justifyContent'],
  center: 'center' as FlexStyle['justifyContent'],
  between: 'space-between' as FlexStyle['justifyContent'],
  around: 'space-around' as FlexStyle['justifyContent'],
  evenly: 'space-evenly' as FlexStyle['justifyContent'],
};

export const alignItems = {
  start: (NEEDS_MANUAL_RTL
    ? 'flex-end'
    : 'flex-start') as FlexStyle['alignItems'],
  end: (NEEDS_MANUAL_RTL
    ? 'flex-start'
    : 'flex-end') as FlexStyle['alignItems'],
  center: 'center' as FlexStyle['alignItems'],
  stretch: 'stretch' as FlexStyle['alignItems'],
};

export const spacing = {
  marginStart: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { marginRight: value } : { marginStart: value },
  marginEnd: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { marginLeft: value } : { marginEnd: value },
  paddingStart: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { paddingRight: value } : { paddingStart: value },
  paddingEnd: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { paddingLeft: value } : { paddingEnd: value },
};

export const position = {
  start: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { right: value } : { start: value },
  end: (value: number): ViewStyle =>
    NEEDS_MANUAL_RTL ? { left: value } : { end: value },
};

export const tw = {
  flexRow: NEEDS_MANUAL_RTL ? 'flex-row-reverse' : 'flex-row',

  textStart: IS_RTL ? 'text-right' : 'text-left',
  textEnd: IS_RTL ? 'text-left' : 'text-right',

  justifyStart: NEEDS_MANUAL_RTL ? 'justify-end' : 'justify-start',
  justifyEnd: NEEDS_MANUAL_RTL ? 'justify-start' : 'justify-end',

  itemsStart: NEEDS_MANUAL_RTL ? 'items-end' : 'items-start',
  itemsEnd: NEEDS_MANUAL_RTL ? 'items-start' : 'items-end',

  selfStart: NEEDS_MANUAL_RTL ? 'self-end' : 'self-start',
  selfEnd: NEEDS_MANUAL_RTL ? 'self-start' : 'self-end',

  ps: (size: number | string) =>
    NEEDS_MANUAL_RTL ? `pr-${size}` : `ps-${size}`,
  pe: (size: number | string) =>
    NEEDS_MANUAL_RTL ? `pl-${size}` : `pe-${size}`,

  ms: (size: number | string) =>
    NEEDS_MANUAL_RTL ? `mr-${size}` : `ms-${size}`,
  me: (size: number | string) =>
    NEEDS_MANUAL_RTL ? `ml-${size}` : `me-${size}`,
};

export function rtlStyle<T extends ViewStyle | TextStyle>(
  ltrStyle: T,
  rtlStyle: T
): T {
  return IS_RTL ? rtlStyle : ltrStyle;
}

export const iconTransform = {
  flipHorizontal: IS_RTL ? [{ scaleX: -1 }] : [],
  rotate180: IS_RTL ? [{ rotate: '180deg' }] : [],
};

export const rtlBaseView: ViewStyle = {
  direction: 'rtl',
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
