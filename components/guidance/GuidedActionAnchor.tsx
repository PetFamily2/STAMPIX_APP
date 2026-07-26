import {
  useEffect,
  useRef,
  type ReactElement,
} from 'react';
import {
  View,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';

import type { GuidedActionController } from '@/hooks/useGuidedAction';
import {
  createObservableGuidedTargetRef,
  type ObservableGuidedTargetRef,
} from '@/lib/recommendations/guidance';

export type GuidedTargetRef<T extends View = View> =
  ObservableGuidedTargetRef<T>;

export function useGuidedTargetRef<T extends View = View>() {
  const targetRef = useRef<GuidedTargetRef<T> | null>(null);
  if (targetRef.current === null) {
    targetRef.current = createObservableGuidedTargetRef<T>();
  }
  return targetRef.current;
}

export function GuidedActionAnchor({
  anchorId,
  guide,
  children,
  focus,
  scrollIntoView,
  style,
}: {
  anchorId: string;
  guide: GuidedActionController;
  children: ReactElement | ReactElement[];
  focus?: () => void;
  scrollIntoView?: () => void;
  style?: ViewProps['style'];
}) {
  const ref = useGuidedTargetRef();
  const focusRef = useRef(focus);
  const scrollIntoViewRef = useRef(scrollIntoView);
  focusRef.current = focus;
  scrollIntoViewRef.current = scrollIntoView;
  useEffect(() => {
    if (!guide.canActivateTarget) {
      return;
    }
    let unregister: (() => void) | null = null;
    const syncRegistration = (node: View | null) => {
      unregister?.();
      unregister = null;
      if (!node || !guide.canActivateTarget) {
        return;
      }
      unregister = guide.registerAnchor({
        id: anchorId,
        ref: node,
        getRef: () => ref.current,
        getFocus: () => focusRef.current ?? null,
        ...(scrollIntoViewRef.current
          ? {
              scrollIntoView: () => scrollIntoViewRef.current?.(),
            }
          : {}),
      });
    };
    const unsubscribe = ref.subscribe(syncRegistration);
    syncRegistration(ref.current);
    return () => {
      unsubscribe();
      unregister?.();
    };
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
