import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import type { SelectedBusinessAddress } from '@/lib/businessAddressSelection';
import { parseMissingProfileFields } from '@/lib/businessSettings/completion';
import {
  type BusinessExampleId,
  type BusinessServiceType,
  type DiscoverySourceId,
  formatProfileFieldValue,
  isProfileCompletionField,
  type OwnerAgeRangeId,
  type ProfileCompletionField,
  type ReasonId,
  sanitizeServiceTags,
  sanitizeServiceTypes,
  type UsageAreaId,
} from '@/lib/businessSettings/profileFields';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { getEditConflictError } from '@/lib/errors/editConflicts';

export type BusinessSettingsSnapshot = {
  name: string;
  shortDescription: string;
  businessPhone: string;
  formattedAddress: string;
  serviceTypes: BusinessServiceType[];
  serviceTags: string[];
  usageAreas: UsageAreaId[];
  businessExample: BusinessExampleId | null;
  birthdayCampaignRelevant: boolean | null;
  joinAnniversaryCampaignRelevant: boolean | null;
  weakTimePromosRelevant: boolean | null;
  discoverySource: DiscoverySourceId | null;
  reason: ReasonId | null;
  ownerAgeRange: OwnerAgeRangeId | null;
};

const EMPTY_SNAPSHOT: BusinessSettingsSnapshot = {
  name: '',
  shortDescription: '',
  businessPhone: '',
  formattedAddress: '',
  serviceTypes: [],
  serviceTags: [],
  usageAreas: [],
  businessExample: null,
  birthdayCampaignRelevant: null,
  joinAnniversaryCampaignRelevant: null,
  weakTimePromosRelevant: null,
  discoverySource: null,
  reason: null,
  ownerAgeRange: null,
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return fallback;
  }
  return fallback;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return value === true || value === false ? value : null;
}

export function useBusinessSettingsProfile() {
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canEditBusiness =
    activeBusinessCapabilities?.edit_business_profile === true;

  const businessSettings = useQuery(
    api.business.getBusinessSettings,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const updateBusinessProfile = useMutation(api.business.updateBusinessProfile);
  const updateBusinessAddress = useMutation(api.business.updateBusinessAddress);
  const saveBusinessOnboardingSnapshot = useMutation(
    api.business.saveBusinessOnboardingSnapshot
  );

  const [snapshot, setSnapshot] =
    useState<BusinessSettingsSnapshot>(EMPTY_SNAPSHOT);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const baseUpdatedAtRef = useRef<number | null>(null);
  const [conflictLocked, setConflictLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const commitBaseUpdatedAt = useCallback((value: number | null) => {
    baseUpdatedAtRef.current = value;
    setBaseUpdatedAt(value);
  }, []);

  const applyBusinessSettingsSnapshot = useCallback(
    (settings: typeof businessSettings) => {
      if (!settings) {
        return null;
      }
      const onboarding = settings.onboardingSnapshot;
      const nextSnapshot = {
        name: settings.name ?? '',
        shortDescription: settings.shortDescription ?? '',
        businessPhone: settings.businessPhone ?? '',
        formattedAddress: settings.formattedAddress ?? '',
        serviceTypes: sanitizeServiceTypes(settings.serviceTypes),
        serviceTags: sanitizeServiceTags(settings.serviceTags),
        usageAreas: (onboarding?.usageAreas as UsageAreaId[] | undefined) ?? [],
        businessExample:
          (onboarding?.businessExample as BusinessExampleId | undefined) ??
          null,
        birthdayCampaignRelevant: asBooleanOrNull(
          onboarding?.birthdayCampaignRelevant
        ),
        joinAnniversaryCampaignRelevant: asBooleanOrNull(
          onboarding?.joinAnniversaryCampaignRelevant
        ),
        weakTimePromosRelevant: asBooleanOrNull(
          onboarding?.weakTimePromosRelevant
        ),
        discoverySource:
          (onboarding?.discoverySource as DiscoverySourceId | undefined) ??
          null,
        reason: (onboarding?.reason as ReasonId | undefined) ?? null,
        ownerAgeRange:
          (onboarding?.ownerAgeRange as OwnerAgeRangeId | undefined) ?? null,
      };
      setSnapshot(nextSnapshot);
      commitBaseUpdatedAt(
        typeof settings.updatedAt === 'number' ? settings.updatedAt : null
      );
      setConflictLocked(false);
      return nextSnapshot;
    },
    [commitBaseUpdatedAt]
  );

  useEffect(() => {
    if (activeBusinessId == null) {
      commitBaseUpdatedAt(null);
      setConflictLocked(false);
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    commitBaseUpdatedAt(null);
    setConflictLocked(false);
    setSnapshot(EMPTY_SNAPSHOT);
  }, [activeBusinessId, commitBaseUpdatedAt]);

  useEffect(() => {
    if (!businessSettings || baseUpdatedAt !== null) {
      return;
    }
    applyBusinessSettingsSnapshot(businessSettings);
  }, [applyBusinessSettingsSnapshot, baseUpdatedAt, businessSettings]);

  const missingFields = useMemo(
    () =>
      parseMissingProfileFields(
        businessSettings?.profileCompletion?.missingFields
      ),
    [businessSettings?.profileCompletion?.missingFields]
  );

  const isComplete = businessSettings?.profileCompletion?.isComplete === true;

  const displayValueFor = (field: ProfileCompletionField) =>
    formatProfileFieldValue(field, snapshot);

  const saveProfileFields = async (overrides: {
    name?: string;
    shortDescription?: string;
    businessPhone?: string;
    serviceTypes?: BusinessServiceType[];
    serviceTags?: string[];
  }) => {
    if (!activeBusinessId || saveInFlightRef.current) {
      return {
        ok: false as const,
        conflict: false,
        message: null,
        updatedAt: null,
      };
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const payload = {
        name: overrides.name ?? snapshot.name,
        shortDescription:
          overrides.shortDescription ?? snapshot.shortDescription,
        businessPhone: overrides.businessPhone ?? snapshot.businessPhone,
        serviceTypes: sanitizeServiceTypes(
          overrides.serviceTypes ?? snapshot.serviceTypes
        ),
        serviceTags: sanitizeServiceTags(
          overrides.serviceTags ?? snapshot.serviceTags
        ),
      };
      const result = await updateBusinessProfile({
        businessId: activeBusinessId,
        expectedUpdatedAt: baseUpdatedAtRef.current ?? undefined,
        ...payload,
      });
      setSnapshot((current) => ({
        ...current,
        ...payload,
      }));
      const updatedAt =
        typeof result?.updatedAt === 'number' ? result.updatedAt : null;
      if (updatedAt !== null) {
        commitBaseUpdatedAt(updatedAt);
      }
      setConflictLocked(false);
      return { ok: true as const, conflict: false, message: null, updatedAt };
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        setConflictLocked(true);
        return {
          ok: false as const,
          conflict: true,
          message: null,
          updatedAt: null,
        };
      }
      return {
        ok: false as const,
        conflict: false,
        message: toErrorMessage(error, 'שמירת הנתון נכשלה.'),
        updatedAt: null,
      };
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const saveOnboardingFields = async (overrides: {
    discoverySource?: DiscoverySourceId;
    reason?: ReasonId;
    usageAreas?: UsageAreaId[];
    ownerAgeRange?: OwnerAgeRangeId;
    businessExample?: BusinessExampleId;
    birthdayCampaignRelevant?: boolean;
    joinAnniversaryCampaignRelevant?: boolean;
    weakTimePromosRelevant?: boolean;
  }) => {
    if (!activeBusinessId || saveInFlightRef.current) {
      return {
        ok: false as const,
        conflict: false,
        message: null,
        updatedAt: null,
      };
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const result = await saveBusinessOnboardingSnapshot({
        businessId: activeBusinessId,
        ...overrides,
      });
      setSnapshot((current) => ({
        ...current,
        ...overrides,
      }));
      const updatedAt =
        typeof result?.updatedAt === 'number' ? result.updatedAt : null;
      if (updatedAt !== null) {
        commitBaseUpdatedAt(updatedAt);
      }
      setConflictLocked(false);
      return { ok: true as const, conflict: false, message: null, updatedAt };
    } catch (error) {
      return {
        ok: false as const,
        conflict: false,
        message: toErrorMessage(error, 'שמירת הנתון נכשלה.'),
        updatedAt: null,
      };
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const saveBusinessAddress = async (address: SelectedBusinessAddress) => {
    if (!activeBusinessId || saveInFlightRef.current) {
      return {
        ok: false as const,
        conflict: false,
        message: null,
        updatedAt: null,
      };
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const result = await updateBusinessAddress({
        businessId: activeBusinessId,
        expectedUpdatedAt: baseUpdatedAtRef.current ?? undefined,
        formattedAddress: address.formattedAddress,
        placeId: address.placeId,
        lat: address.latitude,
        lng: address.longitude,
        city: address.city,
        street: address.street,
        streetNumber: address.streetNumber,
      });
      const updatedAt =
        typeof result?.updatedAt === 'number' ? result.updatedAt : null;
      if (updatedAt !== null) {
        commitBaseUpdatedAt(updatedAt);
      }
      setSnapshot((current) => ({
        ...current,
        formattedAddress: address.formattedAddress,
      }));
      setConflictLocked(false);
      return { ok: true as const, conflict: false, message: null, updatedAt };
    } catch (error) {
      const conflict = getEditConflictError(error);
      if (conflict) {
        setConflictLocked(true);
        return {
          ok: false as const,
          conflict: true,
          message: null,
          updatedAt: null,
        };
      }
      return {
        ok: false as const,
        conflict: false,
        message: toErrorMessage(error, 'עדכון הכתובת נכשל.'),
        updatedAt: null,
      };
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  return {
    activeBusinessId,
    businessSettings,
    canEditBusiness,
    snapshot,
    setSnapshot,
    missingFields,
    isComplete,
    isSaving,
    conflictLocked,
    baseUpdatedAt,
    displayValueFor,
    saveProfileFields,
    saveOnboardingFields,
    saveBusinessAddress,
    applyBusinessSettingsSnapshot: () =>
      applyBusinessSettingsSnapshot(businessSettings),
    isProfileCompletionField,
  };
}
