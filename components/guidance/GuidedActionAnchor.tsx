import { useEffect, useRef, type ReactElement } from 'react';
import {
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';

import type { GuidedActionController } from '@/hooks/useGuidedAction';

export function GuidedActionAnchor({
  anchorId,
  guide,
  children,
  focus,
  expand,
  scrollIntoView,
  style,
}: {
  anchorId: string;
  guide: GuidedActionController;
  children: ReactElement | ReactElement[];
  focus?: () => void;
  expand?: () => void;
  scrollIntoView?: () => void;
  style?: ViewProps['style'];
}) {
  const ref = useRef<View | null>(null);
  const focusRef = useRef(focus);
  const expandRef = useRef(expand);
  const scrollIntoViewRef = useRef(scrollIntoView);
  focusRef.current = focus;
  expandRef.current = expand;
  scrollIntoViewRef.current = scrollIntoView;
  useEffect(() => {
    if (!guide.canActivateTarget) {
      return;
    }
    return guide.registerAnchor({
      id: anchorId,
      ref: ref.current,
      focus: () => focusRef.current?.(),
      expand: () => expandRef.current?.(),
      scrollIntoView: () => scrollIntoViewRef.current?.(),
    });
  }, [anchorId, guide.canActivateTarget, guide.registerAnchor]);
  const onLayout = (_event: LayoutChangeEvent) => {
    if (guide.canActivateTarget) {
      guide.measureAnchor(anchorId);
    }
  };
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={onLayout}
      style={style}
    >
      {children}
    </View>
  );
}
