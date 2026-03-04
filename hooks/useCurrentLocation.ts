import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

type CurrentLocationState = {
  coords: { latitude: number; longitude: number } | null;
  isLoading: boolean;
  needsPermission: boolean;
  showSettingsAction: boolean;
  error: string | null;
  requestPermission: () => Promise<void>;
  refreshLocation: () => Promise<void>;
};

async function getCurrentPosition() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

export function useCurrentLocation(): CurrentLocationState {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [showSettingsAction, setShowSettingsAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLocation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setCoords(null);
        setError('LOCATION_SERVICES_DISABLED');
        return;
      }

      const nextCoords = await getCurrentPosition();
      setCoords(nextCoords);
      setNeedsPermission(false);
      setShowSettingsAction(false);
    } catch (locationError) {
      setCoords(null);
      setError(
        locationError instanceof Error &&
          locationError.message.trim().length > 0
          ? locationError.message
          : 'LOCATION_FETCH_FAILED'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const permissionResult =
        await Location.requestForegroundPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        setNeedsPermission(true);
        setShowSettingsAction(
          permissionResult.status === 'denied' ||
            permissionResult.canAskAgain === false
        );
        setCoords(null);
        return;
      }

      await refreshLocation();
    } catch (permissionError) {
      setError(
        permissionError instanceof Error &&
          permissionError.message.trim().length > 0
          ? permissionError.message
          : 'LOCATION_PERMISSION_FAILED'
      );
    } finally {
      setIsLoading(false);
    }
  }, [refreshLocation]);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();

        if (!isActive) {
          return;
        }

        if (permission.status === 'granted') {
          await refreshLocation();
          return;
        }

        setNeedsPermission(true);
        setShowSettingsAction(
          permission.status === 'denied' || permission.canAskAgain === false
        );
        setIsLoading(false);
      } catch (permissionError) {
        if (!isActive) {
          return;
        }

        setError(
          permissionError instanceof Error &&
            permissionError.message.trim().length > 0
            ? permissionError.message
            : 'LOCATION_PERMISSION_CHECK_FAILED'
        );
        setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [refreshLocation]);

  return {
    coords,
    isLoading,
    needsPermission,
    showSettingsAction,
    error,
    requestPermission,
    refreshLocation,
  };
}
