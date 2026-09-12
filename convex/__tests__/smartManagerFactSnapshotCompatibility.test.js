import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  normalizePersistedCapabilityAvailability,
  normalizePersistedOwnerCapabilities,
  persistedSmartManagerCapabilityAvailabilityValidator,
  smartManagerCapabilityAvailabilityValidator,
  smartManagerWorkerEvaluationValidator,
} from '../lib/smartManagerValidators';
import { getRoleCapabilities } from '../lib/staffPermissions';

const LEGACY_REQUIRED_OWNER_CAPABILITY_FIELDS = [
  'access_dashboard',
  'access_customers',
  'access_campaigns',
  'create_campaigns',
  'edit_campaigns',
  'activate_send_campaigns',
  'delete_campaigns',
  'access_analytics',
  'export_reports',
  'view_usage_quota',
  'view_billing_state',
  'manage_subscription',
  'manage_team',
  'edit_loyalty_cards',
  'view_settings',
  'edit_business_profile',
  'scanner_access',
  'view_customer_state_tier',
];

const KNOWN_OR_UNKNOWN = new Set(['known', 'unknown']);

function buildLegacyOwnerCapabilities() {
  const { invite_businesses: _omitted, ...legacy } =
    getRoleCapabilities('owner');
  return legacy;
}

function buildLegacyCapabilityAvailability() {
  return {
    customerFacts: 'known',
    customerLifecycleFacts: 'known',
    campaignFacts: 'known',
    programFacts: 'known',
    teamFacts: 'known',
    entitlementFacts: 'known',
    ownerCapabilities: buildLegacyOwnerCapabilities(),
  };
}

function objectFieldsAccept(validator, value) {
  if (validator?.kind !== 'object' || !value || typeof value !== 'object') {
    return false;
  }
  for (const [key, field] of Object.entries(validator.fields)) {
    if (!(key in value)) {
      if (field.isOptional !== 'optional') {
        return false;
      }
      continue;
    }
    if (field.kind === 'object') {
      if (!objectFieldsAccept(field, value[key])) {
        return false;
      }
      continue;
    }
    if (field.kind === 'boolean' && typeof value[key] !== 'boolean') {
      return false;
    }
    if (
      field.kind === 'union' &&
      Array.isArray(field.members) &&
      field.members.every((member) => member.kind === 'literal')
    ) {
      const allowed = new Set(field.members.map((member) => member.value));
      if (!allowed.has(value[key])) {
        return false;
      }
    }
  }
  return true;
}

describe('persisted Smart Manager snapshot capability compatibility', () => {
  test('schema keeps historical snapshots valid without weakening current capability maps', () => {
    const currentFields =
      smartManagerCapabilityAvailabilityValidator.fields.ownerCapabilities
        .fields;
    const persistedFields =
      persistedSmartManagerCapabilityAvailabilityValidator.fields
        .ownerCapabilities.fields;

    expect(Object.keys(persistedFields).sort()).toEqual(
      Object.keys(currentFields).sort()
    );
    expect(currentFields.invite_businesses.isOptional).toBe('required');
    expect(persistedFields.invite_businesses.isOptional).toBe('optional');
    expect(
      smartManagerWorkerEvaluationValidator.fields.capabilityAvailability
    ).toBe(smartManagerCapabilityAvailabilityValidator);

    for (const [key, current] of Object.entries(currentFields)) {
      const persisted = persistedFields[key];
      expect(persisted).toBeDefined();
      expect(persisted.kind).toBe(current.kind);
      if (LEGACY_REQUIRED_OWNER_CAPABILITY_FIELDS.includes(key)) {
        expect(persisted.isOptional).toBe('required');
      } else {
        expect(persisted.isOptional).toBe('optional');
      }
    }

    const schema = readFileSync('convex/schema.ts', 'utf8');
    expect(schema).toContain(
      'capabilityAvailability:\n      persistedSmartManagerCapabilityAvailabilityValidator'
    );
    expect(schema).not.toContain(
      'capabilityAvailability: smartManagerCapabilityAvailabilityValidator'
    );
  });

  test('legacy snapshots without invite_businesses validate and normalize to deny', () => {
    const legacyAvailability = buildLegacyCapabilityAvailability();
    expect(
      legacyAvailability.ownerCapabilities.invite_businesses
    ).toBeUndefined();
    expect(
      objectFieldsAccept(
        persistedSmartManagerCapabilityAvailabilityValidator,
        legacyAvailability
      )
    ).toBe(true);
    expect(
      objectFieldsAccept(
        smartManagerCapabilityAvailabilityValidator,
        legacyAvailability
      )
    ).toBe(false);

    const normalized =
      normalizePersistedCapabilityAvailability(legacyAvailability);
    expect(normalized.ownerCapabilities.invite_businesses).toBe(false);
    expect(
      objectFieldsAccept(
        smartManagerCapabilityAvailabilityValidator,
        normalized
      )
    ).toBe(true);
    expect(KNOWN_OR_UNKNOWN.has(normalized.customerFacts)).toBe(true);
  });

  test('missing invite_businesses never grants permission from historical data', () => {
    expect(
      normalizePersistedOwnerCapabilities(undefined).invite_businesses
    ).toBe(false);
    expect(normalizePersistedOwnerCapabilities({}).invite_businesses).toBe(
      false
    );
    expect(
      normalizePersistedOwnerCapabilities(buildLegacyOwnerCapabilities())
        .invite_businesses
    ).toBe(false);
    expect(
      normalizePersistedOwnerCapabilities({
        ...buildLegacyOwnerCapabilities(),
        invite_businesses: false,
      }).invite_businesses
    ).toBe(false);
    expect(
      normalizePersistedOwnerCapabilities({
        ...buildLegacyOwnerCapabilities(),
        invite_businesses: true,
      }).invite_businesses
    ).toBe(true);
  });

  test('new snapshot capability maps still require an explicit invite_businesses boolean', () => {
    const current = {
      ...buildLegacyCapabilityAvailability(),
      ownerCapabilities: getRoleCapabilities('owner'),
    };
    expect(current.ownerCapabilities.invite_businesses).toBe(true);
    expect(Object.hasOwn(current.ownerCapabilities, 'invite_businesses')).toBe(
      true
    );
    expect(
      objectFieldsAccept(smartManagerCapabilityAvailabilityValidator, current)
    ).toBe(true);
    expect(
      objectFieldsAccept(
        persistedSmartManagerCapabilityAvailabilityValidator,
        current
      )
    ).toBe(true);
  });

  test('owner, manager, and staff current invite_businesses semantics remain unchanged', () => {
    expect(getRoleCapabilities('owner').invite_businesses).toBe(true);
    expect(getRoleCapabilities('manager').invite_businesses).toBe(true);
    expect(getRoleCapabilities('staff').invite_businesses).toBe(false);
  });

  test('B2B referral authorization stays on live membership capabilities', () => {
    const engine = readFileSync('convex/businessReferralEngine.ts', 'utf8');
    const summary = engine.match(
      /export const getBusinessReferralHub = query\({[\s\S]*?\n}\);/
    )?.[0];
    const createLink = engine.match(
      /export const getOrCreateBusinessReferralCode = mutation\({[\s\S]*?\n}\);/
    )?.[0];

    expect(summary).toContain('requireActorHasBusinessCapability');
    expect(summary).toContain("'invite_businesses'");
    expect(summary).not.toContain('smartManagerFactSnapshots');
    expect(summary).not.toContain('capabilityAvailability');
    expect(createLink).toContain('requireActorHasBusinessCapability');
    expect(createLink).toContain("'invite_businesses'");
    expect(createLink).not.toContain('smartManagerFactSnapshots');
  });
});
