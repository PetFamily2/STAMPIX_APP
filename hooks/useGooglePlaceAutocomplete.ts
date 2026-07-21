import { useAction } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/convex/_generated/api';
import {
  createPlacesSessionToken,
  normalizePlacesActionError,
  type GooglePlacesAutocompleteMode,
  type PlaceSuggestion,
} from '@/lib/googlePlaces';

type UseGooglePlaceAutocompleteOptions = {
  mode?: GooglePlacesAutocompleteMode;
  selectedCity?: { displayName: string } | null;
};

type UseGooglePlaceAutocompleteResult = {
  suggestions: PlaceSuggestion[];
  isLoading: boolean;
  error: string | null;
  sessionToken: string;
  clearSuggestions: () => void;
  resetSessionToken: () => void;
};

export function useGooglePlaceAutocomplete(
  query: string,
  options: UseGooglePlaceAutocompleteOptions = {}
): UseGooglePlaceAutocompleteResult {
  const autocompletePlaces = useAction(api.googlePlaces.autocomplete);
  const mode = options.mode ?? 'default';
  const sessionTokenRef = useRef<string | null>(null);
  if (mode === 'default' && sessionTokenRef.current === null) {
    sessionTokenRef.current = createPlacesSessionToken();
  }
  const requestGenerationRef = useRef(0);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = useMemo(() => query.trim(), [query]);
  const selectedCityDisplayName =
    options.selectedCity?.displayName.trim() ?? '';

  useEffect(() => {
    requestGenerationRef.current += 1;
    const requestGeneration = requestGenerationRef.current;
    const hasRequiredCityContext =
      mode !== 'street' || selectedCityDisplayName.length > 0;
    if (trimmedQuery.length < 2 || !hasRequiredCityContext) {
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
          const nextSuggestions = await autocompletePlaces({
            query: trimmedQuery,
            mode,
            ...(mode === 'default'
              ? { sessionToken: sessionTokenRef.current ?? '' }
              : {}),
            ...(mode === 'street'
              ? { selectedCity: { displayName: selectedCityDisplayName } }
              : {}),
          });

          if (
            !isActive ||
            requestGeneration !== requestGenerationRef.current
          ) {
            return;
          }

          setSuggestions(nextSuggestions);
        } catch (fetchError) {
          if (
            !isActive ||
            requestGeneration !== requestGenerationRef.current
          ) {
            return;
          }

          setSuggestions([]);
          setError(normalizePlacesActionError(fetchError));
        } finally {
          if (
            isActive &&
            requestGeneration === requestGenerationRef.current
          ) {
            setIsLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      isActive = false;
      requestGenerationRef.current += 1;
      clearTimeout(timeoutId);
    };
  }, [autocompletePlaces, mode, selectedCityDisplayName, trimmedQuery]);

  return {
    suggestions,
    isLoading,
    error,
    sessionToken: sessionTokenRef.current ?? '',
    clearSuggestions: () => {
      requestGenerationRef.current += 1;
      setSuggestions([]);
      setError(null);
      setIsLoading(false);
    },
    resetSessionToken: () => {
      if (mode === 'default') {
        sessionTokenRef.current = createPlacesSessionToken();
      }
    },
  };
}
