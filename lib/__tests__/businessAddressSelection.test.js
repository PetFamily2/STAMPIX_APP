import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  applyManualCoordinateCorrection,
  areBusinessAddressesEqual,
  invalidateSelectionAfterQueryEdit,
  isValidSelectedBusinessAddress,
  shouldAcceptAddressDetailsResponse,
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

describe('business address selection state', () => {
  test('valid save state requires selected place identity and coordinates', () => {
    expect(isValidSelectedBusinessAddress(selectedAddress)).toBe(true);
    expect(isValidSelectedBusinessAddress(null)).toBe(false);
    expect(
      isValidSelectedBusinessAddress({
        ...selectedAddress,
        placeId: '',
      })
    ).toBe(false);
    expect(
      isValidSelectedBusinessAddress({
        ...selectedAddress,
        formattedAddress: '',
      })
    ).toBe(false);
    expect(
      isValidSelectedBusinessAddress({
        ...selectedAddress,
        latitude: Number.NaN,
      })
    ).toBe(false);
  });

  test('editing after selection invalidates the selected place', () => {
    expect(
      invalidateSelectionAfterQueryEdit(
        selectedAddress.formattedAddress,
        selectedAddress
      )
    ).toEqual(selectedAddress);
    expect(invalidateSelectionAfterQueryEdit('דיזנגוף 101', selectedAddress)).toBe(
      null
    );
  });

  test('raw query cannot become valid save state', () => {
    expect(
      isValidSelectedBusinessAddress({
        placeId: '',
        formattedAddress: 'typed query only',
        latitude: 32,
        longitude: 34,
        city: '',
        street: '',
        streetNumber: '',
      })
    ).toBe(false);
  });

  test('manual correction updates coordinates and preserves selected identity', () => {
    const corrected = applyManualCoordinateCorrection(selectedAddress, {
      latitude: 32.081,
      longitude: 34.775,
    });

    expect(corrected.placeId).toBe(selectedAddress.placeId);
    expect(corrected.formattedAddress).toBe(selectedAddress.formattedAddress);
    expect(corrected.latitude).toBe(32.081);
    expect(corrected.longitude).toBe(34.775);
    expect(corrected.manuallyAdjusted).toBe(true);
  });

  test('manual correction is exposed only after selection in canonical selector', () => {
    const source = readFileSync(
      'components/business/BusinessAddressSelector.tsx',
      'utf8'
    );

    expect(source).toContain('hasValidSelection && selectedAddress');
    expect(source).toContain('startCorrection');
    expect(source).toContain('cancelCorrection');
    expect(source).toContain('confirmCorrection');
    expect(source).not.toContain('manual:');
  });

  test('stale autocomplete results are guarded in the hook', () => {
    const source = readFileSync('hooks/useGooglePlaceAutocomplete.ts', 'utf8');

    expect(source).toContain('let isActive = true');
    expect(source).toContain('isActive = false');
    expect(source).toContain('clearTimeout(timeoutId)');
  });

  test('older details response is rejected after a newer request wins', () => {
    const requestA = 1;
    const requestB = 2;

    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: requestB,
        currentSequence: requestB,
        querySnapshot: 'cafe',
        currentQuery: 'cafe',
        isMounted: true,
      })
    ).toBe(true);
    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: requestA,
        currentSequence: requestB,
        querySnapshot: 'cafe',
        currentQuery: 'cafe',
        isMounted: true,
      })
    ).toBe(false);
  });

  test('pending details response is rejected after query edit or clear', () => {
    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: 1,
        currentSequence: 2,
        querySnapshot: 'cafe',
        currentQuery: 'cafex',
        isMounted: true,
      })
    ).toBe(false);
    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: 1,
        currentSequence: 2,
        querySnapshot: 'cafe',
        currentQuery: '',
        isMounted: true,
      })
    ).toBe(false);
  });

  test('latest unchanged details request is accepted while unmounted is rejected', () => {
    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: 3,
        currentSequence: 3,
        querySnapshot: 'cafe',
        currentQuery: ' cafe ',
        isMounted: true,
      })
    ).toBe(true);
    expect(
      shouldAcceptAddressDetailsResponse({
        requestSequence: 3,
        currentSequence: 3,
        querySnapshot: 'cafe',
        currentQuery: 'cafe',
        isMounted: false,
      })
    ).toBe(false);
  });

  test('address equality treats unchanged prefilled values as clean', () => {
    expect(areBusinessAddressesEqual(selectedAddress, { ...selectedAddress })).toBe(
      true
    );
  });

  test('address equality compares every persisted field', () => {
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        formattedAddress: 'Other address',
      })
    ).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        placeId: 'place_2',
      })
    ).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        latitude: selectedAddress.latitude + 0.001,
      })
    ).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        city: 'Other city',
      })
    ).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        street: 'Other street',
      })
    ).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...selectedAddress,
        streetNumber: '101',
      })
    ).toBe(false);
  });

  test('address equality normalizes optional empty strings and whitespace', () => {
    expect(
      areBusinessAddressesEqual(
        { ...selectedAddress, city: '', street: ' ', streetNumber: '' },
        { ...selectedAddress, city: ' ', street: '', streetNumber: ' ' }
      )
    ).toBe(true);
    expect(
      areBusinessAddressesEqual(
        { ...selectedAddress, formattedAddress: '  main address  ' },
        { ...selectedAddress, formattedAddress: 'main address' }
      )
    ).toBe(true);
  });

  test('coordinate adjustment is dirty and restoring coordinates is clean', () => {
    const adjusted = {
      ...selectedAddress,
      latitude: selectedAddress.latitude + 0.001,
      manuallyAdjusted: true,
    };

    expect(areBusinessAddressesEqual(selectedAddress, adjusted)).toBe(false);
    expect(
      areBusinessAddressesEqual(selectedAddress, {
        ...adjusted,
        latitude: selectedAddress.latitude,
      })
    ).toBe(true);
  });
});
