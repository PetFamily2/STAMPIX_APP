export type SelectedBusinessAddress = {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  street: string;
  streetNumber: string;
  manuallyAdjusted?: boolean;
};

type LatestIntentInput = {
  requestSequence: number;
  currentSequence: number;
  querySnapshot: string;
  currentQuery: string;
  isMounted: boolean;
};

function normalizeOptionalText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export function isValidSelectedBusinessAddress(
  value: SelectedBusinessAddress | null | undefined
) {
  return Boolean(
    value &&
      value.placeId.trim().length > 0 &&
      value.formattedAddress.trim().length > 0 &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
  );
}

export function invalidateSelectionAfterQueryEdit(
  query: string,
  selectedAddress: SelectedBusinessAddress | null
) {
  if (!selectedAddress) {
    return null;
  }

  return query.trim() === selectedAddress.formattedAddress.trim()
    ? selectedAddress
    : null;
}

export function applyManualCoordinateCorrection(
  selectedAddress: SelectedBusinessAddress,
  coordinate: { latitude: number; longitude: number }
): SelectedBusinessAddress {
  if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) {
    throw new Error('INVALID_COORDINATE');
  }

  return {
    ...selectedAddress,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    manuallyAdjusted: true,
  };
}

export function shouldAcceptAddressDetailsResponse({
  requestSequence,
  currentSequence,
  querySnapshot,
  currentQuery,
  isMounted,
}: LatestIntentInput) {
  return (
    isMounted &&
    requestSequence === currentSequence &&
    querySnapshot.trim() === currentQuery.trim()
  );
}

export function areBusinessAddressesEqual(
  a: SelectedBusinessAddress | null | undefined,
  b: SelectedBusinessAddress | null | undefined
) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  return (
    normalizeOptionalText(a.placeId) === normalizeOptionalText(b.placeId) &&
    normalizeOptionalText(a.formattedAddress) ===
      normalizeOptionalText(b.formattedAddress) &&
    Number(a.latitude) === Number(b.latitude) &&
    Number(a.longitude) === Number(b.longitude) &&
    normalizeOptionalText(a.city) === normalizeOptionalText(b.city) &&
    normalizeOptionalText(a.street) === normalizeOptionalText(b.street) &&
    normalizeOptionalText(a.streetNumber) ===
      normalizeOptionalText(b.streetNumber)
  );
}
