import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  areBusinessAddressesEqual,
  createBusinessAddressSelectionState,
  editBusinessAddressCity,
  editBusinessAddressHouseNumber,
  editBusinessAddressStreet,
  getCitySelectionKey,
  isAddressResolutionReady,
  isValidHouseNumber,
  isValidSelectedBusinessAddress,
  selectBusinessAddressCity,
  selectBusinessAddressStreet,
  shouldAcceptAddressResolutionResponse,
} from '../businessAddressSelection';

const selectedAddress = {
  placeId: 'place_1',
  formattedAddress: 'דיזנגוף 100, תל אביב-יפו, ישראל',
  latitude: 32.0801,
  longitude: 34.7742,
  city: 'תל אביב-יפו',
  street: 'דיזנגוף',
  streetNumber: '100',
};

function buildReadyState() {
  let state = createBusinessAddressSelectionState(null);
  state = selectBusinessAddressCity(state, {
    displayName: 'תל אביב-יפו',
    placeId: 'city_1',
  });
  state = selectBusinessAddressStreet(state, {
    displayName: 'דיזנגוף',
    placeId: 'street_1',
  });
  return editBusinessAddressHouseNumber(state, '100');
}

describe('business address selection state', () => {
  test('valid canonical address requires all persisted fields and valid coordinates', () => {
    expect(isValidSelectedBusinessAddress(selectedAddress)).toBe(true);
    expect(isValidSelectedBusinessAddress(null)).toBe(false);
    for (const field of ['placeId', 'formattedAddress', 'city', 'street', 'streetNumber']) {
      expect(
        isValidSelectedBusinessAddress({ ...selectedAddress, [field]: '' })
      ).toBe(false);
    }
    expect(
      isValidSelectedBusinessAddress({
        ...selectedAddress,
        latitude: Number.NaN,
      })
    ).toBe(false);
    expect(
      isValidSelectedBusinessAddress({ ...selectedAddress, longitude: 181 })
    ).toBe(false);
  });

  test('house-number validation supports practical Israeli formats', () => {
    for (const value of [
      '12',
      ' 12 ',
      '12א',
      '12׳א',
      '12 א',
      '12-14',
      '12/1',
      '12A',
    ]) {
      expect(isValidHouseNumber(value)).toBe(true);
    }
  });

  for (const { label, value } of [
    { label: 'letters only', value: 'בית' },
    { label: 'comma', value: '12,1' },
    { label: 'newline', value: '12\n1' },
    { label: 'carriage return', value: '12\r1' },
    { label: 'tab', value: '12\t1' },
    { label: 'null character', value: '12\u00001' },
    { label: 'C1 control character', value: '12\u00851' },
    { label: 'more than 16 normalized characters', value: '12345678901234567' },
    { label: 'unsupported character', value: '12@1' },
  ]) {
    test(`house-number validation rejects ${label}`, () => {
      expect(isValidHouseNumber(value)).toBe(false);
    });
  }

  test('city editing clears all downstream state and canonical output', () => {
    const state = editBusinessAddressCity(buildReadyState(), 'חיפה');

    expect(state.cityText).toBe('חיפה');
    expect(state.citySelection).toBeNull();
    expect(state.streetText).toBe('');
    expect(state.streetSelection).toBeNull();
    expect(state.houseNumber).toBe('');
    expect(state.candidates).toEqual([]);
    expect(state.resolvedAddress).toBeNull();
  });

  test('street editing clears number and resolution while preserving city', () => {
    const ready = buildReadyState();
    const state = editBusinessAddressStreet(ready, 'הרצל');

    expect(state.citySelection).toEqual(ready.citySelection);
    expect(state.streetText).toBe('הרצל');
    expect(state.streetSelection).toBeNull();
    expect(state.houseNumber).toBe('');
    expect(state.resolvedAddress).toBeNull();
  });

  test('number editing clears resolution only', () => {
    const ready = buildReadyState();
    const state = editBusinessAddressHouseNumber(
      { ...ready, resolvedAddress: selectedAddress, status: 'resolved' },
      '101'
    );

    expect(state.citySelection).toEqual(ready.citySelection);
    expect(state.streetSelection).toEqual(ready.streetSelection);
    expect(state.houseNumber).toBe('101');
    expect(state.resolvedAddress).toBeNull();
    expect(state.status).toBe('idle');
  });

  test('stored complete address prefills as valid selections without fake place ids', () => {
    const state = createBusinessAddressSelectionState(selectedAddress);

    expect(state.citySelection).toEqual({ displayName: selectedAddress.city });
    expect(state.streetSelection).toEqual({
      displayName: selectedAddress.street,
      cityKey: getCitySelectionKey(state.citySelection),
    });
    expect(state.resolvedAddress).toEqual(selectedAddress);
    expect(state.status).toBe('resolved');
    expect(isAddressResolutionReady(state)).toBe(true);
  });

  test('legacy incomplete address is not treated as resolved prefill', () => {
    const state = createBusinessAddressSelectionState({
      ...selectedAddress,
      streetNumber: '',
    });

    expect(state.citySelection).toBeNull();
    expect(state.streetSelection).toBeNull();
    expect(state.resolvedAddress).toBeNull();
  });

  test('latest resolution intent requires exact generation, context and mount', () => {
    const base = {
      requestGeneration: 3,
      currentGeneration: 3,
      cityKey: 'city',
      currentCityKey: 'city',
      streetKey: 'street',
      currentStreetKey: 'street',
      streetNumber: '12 א',
      currentStreetNumber: ' 12  א ',
      isMounted: true,
    };
    expect(shouldAcceptAddressResolutionResponse(base)).toBe(true);
    expect(
      shouldAcceptAddressResolutionResponse({
        ...base,
        currentGeneration: 4,
      })
    ).toBe(false);
    expect(
      shouldAcceptAddressResolutionResponse({
        ...base,
        currentCityKey: 'other-city',
      })
    ).toBe(false);
    expect(
      shouldAcceptAddressResolutionResponse({
        ...base,
        currentStreetKey: 'other-street',
      })
    ).toBe(false);
    expect(
      shouldAcceptAddressResolutionResponse({ ...base, isMounted: false })
    ).toBe(false);
  });

  test('address equality compares every persisted field and supports clean re-resolution', () => {
    expect(areBusinessAddressesEqual(selectedAddress, { ...selectedAddress })).toBe(
      true
    );
    for (const [field, value] of [
      ['placeId', 'place_2'],
      ['formattedAddress', 'Other address'],
      ['latitude', selectedAddress.latitude + 0.001],
      ['longitude', selectedAddress.longitude + 0.001],
      ['city', 'חיפה'],
      ['street', 'הרצל'],
      ['streetNumber', '101'],
    ]) {
      expect(
        areBusinessAddressesEqual(selectedAddress, {
          ...selectedAddress,
          [field]: value,
        })
      ).toBe(false);
    }
  });

  test('selector has no business-address map/pin flow and keeps Google attribution', () => {
    const source = readFileSync(
      'components/business/BusinessAddressSelector.tsx',
      'utf8'
    );
    const settingsSource = readFileSync(
      'app/(authenticated)/(business)/settings-business-address.tsx',
      'utf8'
    );

    expect(source).not.toContain('react-native-maps');
    expect(source).not.toContain('MapView');
    expect(source).not.toContain('Marker');
    expect(source).not.toContain('correctionDraft');
    expect(source).not.toContain('manualCorrection');
    expect(source).not.toContain('Powered by Google');
    expect(source).toContain("googleAttribution: 'Google Maps'");
    expect(source).toContain("fontWeight: '400'");
    expect(source).toContain('...ltrIslandText');
    expect(source).toContain('flexDirection: flexDirection.row');
    expect(source).toContain("writingDirection: 'rtl'");
    expect(settingsSource).toContain('alignSelf: selfEnd');
  });

  test('autocomplete and resolution hooks retain generation and unmount guards', () => {
    const autocompleteSource = readFileSync(
      'hooks/useGooglePlaceAutocomplete.ts',
      'utf8'
    );
    const selectorSource = readFileSync(
      'components/business/BusinessAddressSelector.tsx',
      'utf8'
    );

    expect(autocompleteSource).toContain('requestGenerationRef');
    expect(autocompleteSource).toContain('let isActive = true');
    expect(autocompleteSource).toContain('isActive = false');
    expect(selectorSource).toContain('resolutionGenerationRef');
    expect(selectorSource).toContain('mountedRef.current = false');
    expect(selectorSource).toContain('shouldAcceptAddressResolutionResponse');
  });
});
