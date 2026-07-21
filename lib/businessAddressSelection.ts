export type SelectedBusinessAddress = {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  street: string;
  streetNumber: string;
};

export type AddressFieldSelection = {
  displayName: string;
  placeId?: string;
};

export type StreetFieldSelection = AddressFieldSelection & {
  cityKey: string;
};

export type BusinessAddressSelectionStatus =
  | 'idle'
  | 'resolving'
  | 'resolved'
  | 'ambiguous'
  | 'error';

export type BusinessAddressSelectionState = {
  cityText: string;
  citySelection: AddressFieldSelection | null;
  streetText: string;
  streetSelection: StreetFieldSelection | null;
  houseNumber: string;
  resolvedAddress: SelectedBusinessAddress | null;
  candidates: SelectedBusinessAddress[];
  status: BusinessAddressSelectionStatus;
  error: string | null;
};

type LatestResolutionIntentInput = {
  requestGeneration: number;
  currentGeneration: number;
  cityKey: string;
  currentCityKey: string;
  streetKey: string;
  currentStreetKey: string;
  streetNumber: string;
  currentStreetNumber: string;
  isMounted: boolean;
};

function normalizeOptionalText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export function normalizeAddressFieldText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeHouseNumber(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidHouseNumber(value: string) {
  if (/[\u0000-\u001F\u007F-\u009F]/.test(value)) {
    return false;
  }
  const normalized = normalizeHouseNumber(value);
  return (
    normalized.length > 0 &&
    normalized.length <= 16 &&
    /[0-9]/.test(normalized) &&
    /^[0-9A-Za-z\u05D0-\u05EA\u05F3\u05F4 /-]+$/.test(normalized)
  );
}

export function getCitySelectionKey(selection: AddressFieldSelection | null) {
  if (!selection) {
    return '';
  }
  const displayName = normalizeAddressFieldText(selection.displayName).toLocaleLowerCase(
    'he'
  );
  const placeId = selection.placeId?.trim() ?? '';
  return `${placeId || 'stored'}|${displayName}`;
}

export function getStreetSelectionKey(selection: StreetFieldSelection | null) {
  if (!selection) {
    return '';
  }
  const displayName = normalizeAddressFieldText(selection.displayName).toLocaleLowerCase(
    'he'
  );
  const placeId = selection.placeId?.trim() ?? '';
  return `${selection.cityKey}|${placeId || 'stored'}|${displayName}`;
}

function hasValidCoordinates(value: SelectedBusinessAddress) {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function isValidSelectedBusinessAddress(
  value: SelectedBusinessAddress | null | undefined
) {
  return Boolean(
    value &&
      value.placeId.trim().length > 0 &&
      value.formattedAddress.trim().length > 0 &&
      hasValidCoordinates(value) &&
      value.city.trim().length > 0 &&
      value.street.trim().length > 0 &&
      value.streetNumber.trim().length > 0
  );
}

export function createBusinessAddressSelectionState(
  selectedAddress: SelectedBusinessAddress | null | undefined
): BusinessAddressSelectionState {
  if (!isValidSelectedBusinessAddress(selectedAddress) || !selectedAddress) {
    return {
      cityText: '',
      citySelection: null,
      streetText: '',
      streetSelection: null,
      houseNumber: '',
      resolvedAddress: null,
      candidates: [],
      status: 'idle',
      error: null,
    };
  }

  const citySelection: AddressFieldSelection = {
    displayName: selectedAddress.city.trim(),
  };
  const streetSelection: StreetFieldSelection = {
    displayName: selectedAddress.street.trim(),
    cityKey: getCitySelectionKey(citySelection),
  };

  return {
    cityText: citySelection.displayName,
    citySelection,
    streetText: streetSelection.displayName,
    streetSelection,
    houseNumber: selectedAddress.streetNumber.trim(),
    resolvedAddress: selectedAddress,
    candidates: [],
    status: 'resolved',
    error: null,
  };
}

export function editBusinessAddressCity(
  state: BusinessAddressSelectionState,
  cityText: string
): BusinessAddressSelectionState {
  return {
    ...state,
    cityText,
    citySelection: null,
    streetText: '',
    streetSelection: null,
    houseNumber: '',
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
  };
}

export function selectBusinessAddressCity(
  state: BusinessAddressSelectionState,
  selection: AddressFieldSelection
): BusinessAddressSelectionState {
  const displayName = normalizeAddressFieldText(selection.displayName);
  return {
    ...state,
    cityText: displayName,
    citySelection: {
      displayName,
      ...(selection.placeId?.trim() ? { placeId: selection.placeId.trim() } : {}),
    },
    streetText: '',
    streetSelection: null,
    houseNumber: '',
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
  };
}

export function editBusinessAddressStreet(
  state: BusinessAddressSelectionState,
  streetText: string
): BusinessAddressSelectionState {
  return {
    ...state,
    streetText,
    streetSelection: null,
    houseNumber: '',
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
  };
}

export function selectBusinessAddressStreet(
  state: BusinessAddressSelectionState,
  selection: AddressFieldSelection
): BusinessAddressSelectionState {
  const displayName = normalizeAddressFieldText(selection.displayName);
  return {
    ...state,
    streetText: displayName,
    streetSelection: {
      displayName,
      ...(selection.placeId?.trim() ? { placeId: selection.placeId.trim() } : {}),
      cityKey: getCitySelectionKey(state.citySelection),
    },
    houseNumber: '',
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
  };
}

export function editBusinessAddressHouseNumber(
  state: BusinessAddressSelectionState,
  houseNumber: string
): BusinessAddressSelectionState {
  return {
    ...state,
    houseNumber,
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
  };
}

export function isAddressResolutionReady(state: BusinessAddressSelectionState) {
  const cityKey = getCitySelectionKey(state.citySelection);
  return Boolean(
    cityKey &&
      state.streetSelection &&
      state.streetSelection.cityKey === cityKey &&
      isValidHouseNumber(state.houseNumber)
  );
}

export function shouldAcceptAddressResolutionResponse({
  requestGeneration,
  currentGeneration,
  cityKey,
  currentCityKey,
  streetKey,
  currentStreetKey,
  streetNumber,
  currentStreetNumber,
  isMounted,
}: LatestResolutionIntentInput) {
  return (
    isMounted &&
    requestGeneration === currentGeneration &&
    cityKey === currentCityKey &&
    streetKey === currentStreetKey &&
    normalizeHouseNumber(streetNumber) === normalizeHouseNumber(currentStreetNumber)
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
