import { useCallback, useEffect, useRef, useState } from 'react';
export function useCurrentLocation() {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false),
    [needsPermission, setNeedsPermission] = useState(true),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refreshLocation = useCallback(async () => {
    const request = ++generation.current;
    setIsLoading(true);
    setError(null);
    try {
      if (!isSecureContext || !navigator.geolocation)
        throw new Error('LOCATION_UNAVAILABLE');
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60000,
          })
      );
      if (request !== generation.current) return;
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setNeedsPermission(false);
    } catch (failure) {
      if (request !== generation.current) return;
      setCoords(null);
      setNeedsPermission(true);
      setError(
        (failure as { code?: number }).code === 1
          ? 'LOCATION_PERMISSION_DENIED'
          : 'LOCATION_FETCH_FAILED'
      );
    } finally {
      if (request === generation.current) setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    // A granted browser permission may be reused; the initial render never prompts.
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((permission) => {
        if (!disposed && permission.state === 'granted') void refreshLocation();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      ++generation.current;
    };
  }, [refreshLocation]);
  return {
    coords,
    isLoading,
    needsPermission,
    showSettingsAction: false,
    error,
    requestPermission: refreshLocation,
    refreshLocation,
  };
}
