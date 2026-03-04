import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createPlacesSessionToken,
  fetchPlaceSuggestions,
  type PlaceSuggestion,
} from '@/lib/googlePlaces';

type UseGooglePlaceAutocompleteResult = {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  error: string | null;
  sessionToken: string;
  clearSuggestions: () => void;
  resetSessionToken: () => void;
};

export function useGooglePlaceAutocomplete(
  query: string
): UseGooglePlaceAutocompleteResult {
  const sessionTokenRef = useRef(createPlacesSessionToken());
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    const timeoutId = setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        setError(null);

        try {
          const nextSuggestions = await fetchPlaceSuggestions(
            trimmedQuery,
            sessionTokenRef.current
          );

          if (!isActive) {
            return;
          }

          setSuggestions(nextSuggestions);
        } catch (fetchError) {
          if (!isActive) {
            return;
          }

          setSuggestions([]);
          setError(
            fetchError instanceof Error && fetchError.message.trim().length > 0
              ? fetchError.message
              : 'PLACES_AUTOCOMPLETE_FAILED'
          );
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery]);

  return {
    suggestions,
    isLoading,
    error,
    sessionToken: sessionTokenRef.current,
    clearSuggestions: () => {
      setSuggestions([]);
      setError(null);
    },
    resetSessionToken: () => {
      sessionTokenRef.current = createPlacesSessionToken();
    },
  };
}
