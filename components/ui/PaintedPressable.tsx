import { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

const CONTAINER_STYLE_KEYS = new Set([
  'alignSelf',
  'aspectRatio',
  'bottom',
  'display',
  'end',
  'flex',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'height',
  'inset',
  'insetBlock',
  'insetBlockEnd',
  'insetBlockStart',
  'insetInline',
  'insetInlineEnd',
  'insetInlineStart',
  'left',
  'margin',
  'marginBlock',
  'marginBlockEnd',
  'marginBlockStart',
  'marginBottom',
  'marginEnd',
  'marginHorizontal',
  'marginInline',
  'marginInlineEnd',
  'marginInlineStart',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginVertical',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'position',
  'right',
  'start',
  'top',
  'transform',
  'transformOrigin',
  'width',
  'zIndex',
]);

function splitStyle(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);
  if (!flattened) {
    return {
      containerStyle: undefined,
      surfaceStyle: undefined,
    };
  }

  const containerStyle: Record<string, unknown> = {};
  const surfaceStyle: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flattened)) {
    if (CONTAINER_STYLE_KEYS.has(key)) {
      containerStyle[key] = value;
      continue;
    }
    surfaceStyle[key] = value;
    if (key === 'overflow') {
      containerStyle[key] = value;
    }
  }

  return {
    containerStyle: containerStyle as ViewStyle,
    surfaceStyle: surfaceStyle as ViewStyle,
  };
}

function resolveStyle(
  style: PressableProps['style'],
  state: PressableStateCallbackType
) {
  return splitStyle(
    (typeof style === 'function' ? style(state) : style) as StyleProp<ViewStyle>
  );
}

/**
 * Keeps layout and interaction on Pressable while a non-collapsable View owns
 * the visible surface. This avoids Android native-renderer cases where the
 * Pressable remains interactive and its children render, but its fill does not.
 */
export const PaintedPressable = forwardRef<View, PressableProps>(
  function PaintedPressable({ children, style, ...props }, ref) {
    const renderChildren = (state: PressableStateCallbackType): ReactNode => {
      const { surfaceStyle } = resolveStyle(style, state);
      return (
        <View
          collapsable={false}
          pointerEvents="none"
          style={[styles.surface, surfaceStyle]}
        >
          {typeof children === 'function' ? children(state) : children}
        </View>
      );
    };

    return (
      <Pressable
        {...props}
        ref={ref}
        style={(state) => resolveStyle(style, state).containerStyle}
      >
        {renderChildren}
      </Pressable>
    );
  }
);

PaintedPressable.displayName = 'PaintedPressable';

const styles = StyleSheet.create({
  surface: {
    flexGrow: 1,
    flexShrink: 0,
  },
});
