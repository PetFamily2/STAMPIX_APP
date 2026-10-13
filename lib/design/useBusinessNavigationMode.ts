import { useEffect, useState } from 'react';

import {
  readNavigationInputProfile,
  readWebNavigationSource,
  resolveBusinessNavigationMode,
} from '@/lib/design/navigationFormFactor';

export function useBusinessNavigationMode(width: number, height: number) {
  const [profile, setProfile] = useState(() =>
    readNavigationInputProfile(width, height, readWebNavigationSource())
  );

  useEffect(() => {
    const update = () => {
      setProfile(
        readNavigationInputProfile(width, height, readWebNavigationSource())
      );
    };
    update();
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const queries = [
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(hover: hover)'),
      window.matchMedia('(any-pointer: coarse)'),
    ];
    for (const query of queries) {
      query.addEventListener('change', update);
    }
    return () => {
      for (const query of queries) {
        query.removeEventListener('change', update);
      }
    };
  }, [width, height]);

  return resolveBusinessNavigationMode(profile);
}
