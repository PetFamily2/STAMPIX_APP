import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  assertValidPlaceDetails,
  createPlacesSessionToken,
  normalizePlacesActionError,
} from '../googlePlaces';

const OLD_PUBLIC_MAPS_KEY_NAME = 'EXPO_PUBLIC_' + 'GOOGLE_MAPS_API_KEY';
const GOOGLE_MAPS_HOST = 'maps.' + 'googleapis.com';
const UNSUPPORTED_FALLBACK_PROVIDER = 'nomina' + 'tim';
const ANY_CAST = 'as ' + 'any';
const LEGACY_AUTOCOMPLETE_ACTION = 'googlePlaces' + ':autocomplete';
const LEGACY_DETAILS_ACTION = 'googlePlaces' + ':placeDetails';
const LEGACY_DETAILS_IMPORT = 'import { fetch' + 'PlaceDetails';

describe('client Google Places boundary', () => {
  test('client helper keeps only pure session and error behavior', () => {
    const token = createPlacesSessionToken();

    expect(token).toContain('-');
    expect(normalizePlacesActionError(new Error('PLACES_TIMEOUT'))).toBe(
      'PLACES_TIMEOUT'
    );
    expect(
      normalizePlacesActionError(
        new Error('Uncaught Error: PLACES_RATE_LIMITED')
      )
    ).toBe('PLACES_RATE_LIMITED');
    expect(normalizePlacesActionError(new Error('server stack'))).toBe(
      'PLACES_UNKNOWN_SERVICE_ERROR'
    );
  });

  test('place details validation preserves mandatory selected-place rules', () => {
    expect(() =>
      assertValidPlaceDetails({
        placeId: 'place_1',
        formattedAddress: 'Dizengoff 100, Tel Aviv',
        lat: 32.08,
        lng: 34.78,
        city: 'Tel Aviv',
        street: 'Dizengoff',
        streetNumber: '',
      })
    ).not.toThrow();

    expect(() =>
      assertValidPlaceDetails({
        placeId: '',
        formattedAddress: 'Dizengoff 100, Tel Aviv',
        lat: 32.08,
        lng: 34.78,
        city: '',
        street: '',
        streetNumber: '',
      })
    ).toThrow('PLACES_INVALID_DETAILS');
  });

  test('client library has no runtime Google key or HTTP transport', () => {
    const source = readFileSync('lib/googlePlaces.ts', 'utf8');

    expect(source).not.toContain('process.env');
    expect(source).not.toContain(GOOGLE_MAPS_HOST);
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain(OLD_PUBLIC_MAPS_KEY_NAME);
    expect(source).not.toContain(UNSUPPORTED_FALLBACK_PROVIDER);
  });

  test('autocomplete hook calls typed Convex action and keeps stale-response guard', () => {
    const source = readFileSync('hooks/useGooglePlaceAutocomplete.ts', 'utf8');

    expect(source).toContain('api.googlePlaces.autocomplete');
    expect(source).toContain('setTimeout');
    expect(source).toContain('let isActive = true');
    expect(source).toContain('isActive = false');
    expect(source).toContain('clearTimeout(timeoutId)');
    expect(source).not.toContain(ANY_CAST);
    expect(source).not.toContain(`'${LEGACY_AUTOCOMPLETE_ACTION}'`);
    expect(source).not.toContain(GOOGLE_MAPS_HOST);
    expect(source).not.toContain(OLD_PUBLIC_MAPS_KEY_NAME);
  });

  test('details hook uses typed Convex action and selector keeps stale-intent guard', () => {
    const hookSource = readFileSync('hooks/useGooglePlaceDetails.ts', 'utf8');
    const source = readFileSync(
      'components/business/BusinessAddressSelector.tsx',
      'utf8'
    );

    expect(hookSource).toContain('api.googlePlaces.placeDetails');
    expect(hookSource).not.toContain(ANY_CAST);
    expect(hookSource).not.toContain(`'${LEGACY_DETAILS_ACTION}'`);
    expect(source).toContain('useGooglePlaceDetails');
    expect(source).toContain('shouldAcceptAddressDetailsResponse');
    expect(source).not.toContain(LEGACY_DETAILS_IMPORT);
    expect(source).not.toContain(OLD_PUBLIC_MAPS_KEY_NAME);
  });

  test('app config uses native Android Maps key name only', () => {
    const source = readFileSync('app.config.ts', 'utf8');

    expect(source).toContain('GOOGLE_MAPS_ANDROID_API_KEY');
    expect(source).not.toContain(OLD_PUBLIC_MAPS_KEY_NAME);
    expect(source).not.toContain('GOOGLE_PLACES_API_KEY');
  });

  test('generated Convex API includes Google Places actions', () => {
    const source = readFileSync('convex/_generated/api.d.ts', 'utf8');

    expect(source).toContain('type * as googlePlaces');
    expect(source).toContain('googlePlaces: typeof googlePlaces');
  });
});
