import { useAction } from 'convex/react';
import { useCallback } from 'react';

import { api } from '@/convex/_generated/api';
import {
  assertValidPlaceDetails,
  normalizePlacesActionError,
} from '@/lib/googlePlaces';

export function useGooglePlaceDetails() {
  const loadPlaceDetails = useAction(api.googlePlaces.placeDetails);

  return useCallback(
    async (placeId: string, sessionToken: string) => {
      try {
        const details = await loadPlaceDetails({
          placeId,
          sessionToken,
        });
        assertValidPlaceDetails(details);
        return details;
      } catch (error) {
        throw new Error(normalizePlacesActionError(error));
      }
    },
    [loadPlaceDetails]
  );
}
