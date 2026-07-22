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

  test('autocomplete results expand below each active input without clipping later fields', () => {
    const source = readFileSync(
      'components/business/BusinessAddressSelector.tsx',
      'utf8'
    );
    const settingsSource = readFileSync(
      'app/(authenticated)/(business)/settings-business-address.tsx',
      'utf8'
    );
    const onboardingSource = readFileSync(
      'app/(authenticated)/merchant/onboarding/create-business.tsx',
      'utf8'
    );
    const suggestionsCardStyle =
      source.match(/suggestionsCard: \{([\s\S]*?)\n  \},/)?.[1] ?? '';

    expect(source.indexOf('ref={cityInputRef}')).toBeLessThan(
      source.indexOf('suggestions={cityAutocomplete.suggestions}')
    );
    expect(
      source.indexOf('suggestions={cityAutocomplete.suggestions}')
    ).toBeLessThan(source.indexOf('ref={streetInputRef}'));
    expect(source.indexOf('ref={streetInputRef}')).toBeLessThan(
      source.indexOf('suggestions={streetAutocomplete.suggestions}')
    );
    expect(
      source.indexOf('suggestions={streetAutocomplete.suggestions}')
    ).toBeLessThan(source.indexOf('ref={houseNumberInputRef}'));
    expect(suggestionsCardStyle).not.toContain('height');
    expect(source).not.toContain("overflow: 'hidden'");
    expect(source).not.toContain("position: 'absolute'");
    expect(source).not.toContain('zIndex');
    expect(source).toContain('style={styles.suggestionsScroll}');
    expect(source).toContain('maxHeight: 320');
    expect(source).toContain('suggestions.slice(0, 5)');
    expect(source).toContain('keyboardShouldPersistTaps="handled"');
    expect(source).toContain('nestedScrollEnabled');
    expect(source).toContain('<GoogleAttribution />');
    expect(
      source.indexOf('</ScrollView>\n      <GoogleAttribution />')
    ).toBeGreaterThan(
      source.indexOf('<View style={styles.suggestionsCard}>')
    );
    expect(source).toContain('scrollResponderScrollNativeHandleToKeyboard');
    expect(settingsSource).toContain('nestedScrollEnabled');
    expect(settingsSource).toContain(
      "behavior={Platform.OS === 'ios' ? 'padding' : undefined}"
    );
    expect(settingsSource).not.toContain('automaticallyAdjustKeyboardInsets');
    expect(settingsSource).toContain('scrollViewRef={scrollViewRef}');
    expect(onboardingSource).toContain('nestedScrollEnabled');
    expect(onboardingSource).toContain(
      "behavior={Platform.OS === 'ios' ? 'padding' : undefined}"
    );
    expect(onboardingSource).not.toContain(
      'automaticallyAdjustKeyboardInsets'
    );
    expect(onboardingSource).toContain('scrollViewRef={scrollViewRef}');
  });

  test('Settings save confirms success before replacing the address route with Business Settings', () => {
    const settingsSource = readFileSync(
      'app/(authenticated)/(business)/settings-business-address.tsx',
      'utf8'
    );
    const onboardingSource = readFileSync(
      'app/(authenticated)/merchant/onboarding/create-business.tsx',
      'utf8'
    );
    const saveHandler = settingsSource.slice(
      settingsSource.indexOf('const handleSave = async () => {'),
      settingsSource.indexOf('\n  if (!activeBusinessId)')
    );
    const persistenceIndex = saveHandler.indexOf(
      'await updateBusinessAddress({'
    );
    const confirmationIndex = saveHandler.indexOf(
      'Alert.alert(TEXT.savedTitle, TEXT.savedMessage, ['
    );
    const destinationIndex = saveHandler.indexOf(
      "router.replace(\n              '/(authenticated)/(business)/settings-business-profile'"
    );
    const failedSaveBranch = saveHandler.slice(saveHandler.indexOf('} catch'));

    expect(persistenceIndex).toBeGreaterThan(-1);
    expect(confirmationIndex).toBeGreaterThan(persistenceIndex);
    expect(destinationIndex).toBeGreaterThan(confirmationIndex);
    expect(saveHandler).toContain('onPress: () =>');
    expect(saveHandler).not.toContain('router.back()');
    expect(saveHandler).not.toContain('/(authenticated)/(business)/cards');
    expect(failedSaveBranch).not.toContain('router.replace(');
    expect(onboardingSource).toContain(
      'BUSINESS_ONBOARDING_ROUTES.createProgram'
    );
    expect(onboardingSource).not.toContain(
      '/(authenticated)/(business)/settings-business-profile'
    );
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
    expect(autocompleteSource).toContain('trimmedQuery.length < 2');
    expect(autocompleteSource).toContain('}, 300);');
    expect(selectorSource).toContain('resolutionGenerationRef');
    expect(selectorSource).toContain('mountedRef.current = false');
    expect(selectorSource).toContain('shouldAcceptAddressResolutionResponse');
  });
});
