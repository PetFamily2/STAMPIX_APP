import { hashSmartManagerValue } from './smartManagerPolicy';

export const SMART_MANAGER_EXECUTION_KIND = 'smart_manager_v1' as const;
export const SMART_MANAGER_RECIPIENT_ELIGIBILITY_VERSION =
  'smart-manager-at-risk-recipient-v1' as const;
export const SMART_MANAGER_MATERIALIZATION_BATCH_SIZE = 100;
export const SMART_MANAGER_RECIPIENT_FINALIZATION_BATCH_SIZE = 25;
export const SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT = 100;
export const SMART_MANAGER_RECIPIENT_EVENT_LIMIT = 500;

export type SmartManagerResolvedChannel =
  | 'push'
  | 'in_app'
  | 'not_contactable';

export type SmartManagerRecipientHashAccumulator = {
  chainHash: string;
  count: number;
};

export function buildSmartManagerApprovalKey(args: {
  preparedActionId: string;
  selectedCopyId: string;
  selectedCopyRevision: number;
  selectedCopyContentHash: string;
  authorityMode: string;
  authorityBindingHash: string;
  decisionHash: string;
  evidenceFingerprint: string;
  factHash: string;
  policyVersion: string;
  policyHash: string;
  comparisonHash: string;
  sourceGeneration: number;
  audienceDefinitionVersion: string;
  lifecycleSourceFingerprint: string;
  approvedAudienceObservedCount: number;
  channelStrategyVersion: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-approval-v1',
    ...args,
  });
}

export function buildSmartManagerRecipientKey(args: {
  businessId: string;
  userId: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-recipient-identity-v1',
    businessId: args.businessId,
    userId: args.userId,
  });
}

export function buildSmartManagerEligibilityBindingHash(args: {
  recipientKey: string;
  primaryMembershipId: string;
  firstStampAt: number;
  lastStampAt: number;
  positiveIntervalCount: number;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-recipient-eligibility-v1',
    eligibilityVersion: SMART_MANAGER_RECIPIENT_ELIGIBILITY_VERSION,
    ...args,
  });
}

export function buildSmartManagerRecipientBindingHash(args: {
  recipientKey: string;
  eligibilityBindingHash: string;
  channel: SmartManagerResolvedChannel;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-execution-recipient-v1',
    channelStrategyVersion: 'push-with-in-app-fallback-v1',
    ...args,
  });
}

export function emptySmartManagerRecipientHashAccumulator(): SmartManagerRecipientHashAccumulator {
  return {
    chainHash: hashSmartManagerValue({
      namespace: 'smart-manager-recipient-set-seed-v1',
    }),
    count: 0,
  };
}

export function addSmartManagerRecipientBindingToAccumulator(
  accumulator: SmartManagerRecipientHashAccumulator,
  bindingHash: string
): SmartManagerRecipientHashAccumulator {
  return {
    chainHash: hashSmartManagerValue({
      namespace: 'smart-manager-recipient-set-step-v1',
      previousHash: accumulator.chainHash,
      bindingHash,
    }),
    count: accumulator.count + 1,
  };
}

export function finalizeSmartManagerRecipientSetHash(
  accumulator: SmartManagerRecipientHashAccumulator
) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-recipient-set-v1',
    canonicalChainHash: accumulator.chainHash,
    count: accumulator.count,
  });
}

export function buildSmartManagerRecipientSetHash(bindingHashes: string[]) {
  const unique = [...bindingHashes].sort();
  let accumulator = emptySmartManagerRecipientHashAccumulator();
  for (const bindingHash of unique) {
    accumulator = addSmartManagerRecipientBindingToAccumulator(
      accumulator,
      bindingHash
    );
  }
  return finalizeSmartManagerRecipientSetHash(accumulator);
}
