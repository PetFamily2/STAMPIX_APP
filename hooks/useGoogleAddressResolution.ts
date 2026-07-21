import { useAction } from 'convex/react';
import { useCallback } from 'react';

import { api } from '@/convex/_generated/api';
import {
  normalizePlacesActionError,
} from '@/lib/googlePlaces';

export function useGoogleAddressResolution() {
  const resolveGoogleAddress = useAction(api.googlePlaces.resolveAddress);

  return useCallback(
    async (input: { city: string; street: string; streetNumber: string }) => {
      try {
        return await resolveGoogleAddress(input);
      } catch (error) {
        throw new Error(normalizePlacesActionError(error));
      }
    },
    [resolveGoogleAddress]
  );
}
